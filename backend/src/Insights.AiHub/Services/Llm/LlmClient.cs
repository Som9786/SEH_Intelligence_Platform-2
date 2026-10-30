using Insights.AiHub.Configuration;
using Insights.AiHub.Models;
using Microsoft.Extensions.Options;

namespace Insights.AiHub.Services.Llm;

/// The model's text and what the call used.
public sealed record LlmReply(string Text, LlmUsage Usage);

/// The one way the services call a model: passes each call to OpenAI or Amazon Bedrock, as Llm:Provider says, after
/// checking the daily budget.
public sealed class LlmClient(IOptionsMonitor<LlmOptions> options, OpenAIChat openAI, BedrockChat bedrock, UsageTracker usageTracker)
{
    ILlmProvider Provider => options.CurrentValue.UsesBedrock ? bedrock : openAI;

    /// The provider calls go to: "OpenAI" or "Bedrock".
    public string ProviderName => Provider.Name;

    /// The model calls go to: Model, or FallbackModel when Model is empty.
    public string ConfiguredModel => Provider.Options.ConfiguredModel;

    public Task<LlmReply> CompleteAsync(IReadOnlyList<LlmMessage> messages, LlmJsonSchema? schema, CancellationToken ct)
    {
        usageTracker.EnsureWithinBudget();
        return Provider.CompleteAsync(messages, schema, ct);
    }
}
