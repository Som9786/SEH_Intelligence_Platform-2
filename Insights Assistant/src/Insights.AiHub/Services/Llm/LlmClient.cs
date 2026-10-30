using System.ClientModel;
using System.Collections.Concurrent;
using System.Diagnostics;
using Insights.AiHub.Configuration;
using Insights.AiHub.Models;
using Microsoft.Extensions.Options;
using OpenAI;
using OpenAI.Chat;

namespace Insights.AiHub.Services.Llm;

/// The model's text and what the call used.
public sealed record LlmReply(string Text, LlmUsage Usage);

/// Thin wrapper over the OpenAI chat API that applies the configured model and its fallback, and counts each call's cost.
public sealed class LlmClient(IOptions<OpenAIOptions> options, UsageTracker usageTracker, ILogger<LlmClient> logger)
{
    // One client per model, reused across calls so its HTTP connections are too. ChatClient is thread-safe.
    readonly ConcurrentDictionary<string, ChatClient> clients = new();

    /// The model calls go to: Model, or FallbackModel when Model is empty.
    public string ConfiguredModel => string.IsNullOrWhiteSpace(options.Value.Model) ? options.Value.FallbackModel : options.Value.Model;

    /// gpt-5 and the o-series think before answering and accept a reasoning effort.
    static bool IsReasoningModel(string model) =>
        model.StartsWith("gpt-5", StringComparison.OrdinalIgnoreCase) && !model.Contains("chat", StringComparison.OrdinalIgnoreCase)
        || model.Length > 1 && model[0] is 'o' or 'O' && char.IsDigit(model[1]);

    public async Task<LlmReply> CompleteAsync(IReadOnlyList<ChatMessage> messages, ChatCompletionOptions? chatOptions, CancellationToken ct)
    {
        var o = options.Value;
        var apiKey = string.IsNullOrWhiteSpace(o.ApiKey) ? Environment.GetEnvironmentVariable("OPENAI_API_KEY") : o.ApiKey;
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("OpenAI API key is not configured. Set OpenAI:ApiKey with user-secrets or the OPENAI_API_KEY environment variable.");
        usageTracker.EnsureWithinBudget();

        chatOptions ??= new ChatCompletionOptions();
        var model = ConfiguredModel;
        try
        {
            return await CallAsync(model);
        }
        catch (ClientResultException e) when (e.Status == 404 && model != o.FallbackModel)
        {
            logger.LogWarning("Model {Model} is not available ({Message}); using fallback {Fallback}", model, e.Message, o.FallbackModel);
            return await CallAsync(o.FallbackModel);
        }

        async Task<LlmReply> CallAsync(string name)
        {
            // Other models reject the parameter, and the fallback may be one of them.
            var effort = IsReasoningModel(name) && !string.IsNullOrWhiteSpace(o.ReasoningEffort) ? o.ReasoningEffort.Trim().ToLowerInvariant() : null;
            // The SDK marks reasoning effort as experimental (OPENAI001), though the API parameter itself is stable.
#pragma warning disable OPENAI001
            chatOptions.ReasoningEffortLevel = effort is null ? null : new ChatReasoningEffortLevel(effort);
#pragma warning restore OPENAI001
            logger.LogInformation("OpenAI: calling model {Model}{Effort} with {Messages} messages ({Chars} characters)",
                name, effort is null ? "" : $" (reasoning effort {effort})", messages.Count, messages.Sum(m => m.Content.Sum(p => p.Text?.Length ?? 0)));
            var timer = Stopwatch.StartNew();
            var client = clients.GetOrAdd(name, static (model, o) => new ChatClient(model, new ApiKeyCredential(o.Key),
                new OpenAIClientOptions { NetworkTimeout = TimeSpan.FromSeconds(o.TimeoutSeconds) }), (Key: apiKey, o.TimeoutSeconds));
            ChatCompletion completion = await client.CompleteChatAsync(messages, chatOptions, ct);
            logger.LogInformation("OpenAI: {Model} answered in {Ms} ms ({InputTokens} input + {OutputTokens} output tokens, finish reason {FinishReason})",
                completion.Model, timer.ElapsedMilliseconds, completion.Usage?.InputTokenCount, completion.Usage?.OutputTokenCount, completion.FinishReason);
            // Counted before the checks below: OpenAI charges for a refused or cut-off reply too.
            var usage = usageTracker.Record(completion.Model ?? name, completion.Usage?.InputTokenCount ?? 0,
                completion.Usage?.InputTokenDetails?.CachedTokenCount ?? 0, completion.Usage?.OutputTokenCount ?? 0,
                completion.Usage?.OutputTokenDetails?.ReasoningTokenCount ?? 0);

            if (!string.IsNullOrWhiteSpace(completion.Refusal))
                throw new LlmReplyException($"The model refused to answer: {completion.Refusal}");
            // A reply cut off at the token limit is incomplete, and as JSON it wouldn't parse.
            if (completion.FinishReason == ChatFinishReason.Length)
                throw new LlmReplyException("The model ran out of tokens before finishing its answer. Try a simpler question.");
            if (completion.FinishReason == ChatFinishReason.ContentFilter)
                throw new LlmReplyException("OpenAI's content filter blocked the answer.");
            if (completion.Content.Count == 0 || string.IsNullOrWhiteSpace(completion.Content[0].Text))
                throw new LlmReplyException($"The model returned an empty answer (finish reason {completion.FinishReason}).");
            return new(completion.Content[0].Text, usage);
        }
    }
}
