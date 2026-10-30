using System.Collections.Concurrent;
using System.Diagnostics;
using Amazon;
using Amazon.BedrockRuntime;
using Amazon.BedrockRuntime.Model;
using Amazon.Runtime;
using Insights.AiHub.Configuration;
using Microsoft.Extensions.Options;

namespace Insights.AiHub.Services.Llm;

/// The Amazon Bedrock Converse API, with the configured model and its fallback. JSON replies use Converse's structured
/// output (a JSON schema), so the model must support it.
public sealed class BedrockChat(IOptionsMonitor<BedrockOptions> options, UsageTracker usageTracker, ILogger<BedrockChat> logger)
    : ILlmProvider, IDisposable
{
    const string BearerTokenVariable = "AWS_BEARER_TOKEN_BEDROCK";

    // One client per region, credentials and time limit, reused across calls so its HTTP connections are too.
    readonly ConcurrentDictionary<(string Region, string ApiKey, string AccessKeyId, string Secret, string Session, int TimeoutSeconds),
        AmazonBedrockRuntimeClient> clients = new();

    public string Name => LlmOptions.Bedrock;
    public LlmProviderOptions Options => options.CurrentValue;

    public async Task<LlmReply> CompleteAsync(IReadOnlyList<LlmMessage> messages, LlmJsonSchema? schema, CancellationToken ct)
    {
        var o = options.CurrentValue;
        if (string.IsNullOrWhiteSpace(o.Region))
            throw new InvalidOperationException("Bedrock region is not configured. Set Bedrock:Region in the AI Hub's appsettings.json.");
        if (string.IsNullOrWhiteSpace(o.ConfiguredModel))
            throw new InvalidOperationException("Bedrock model is not configured. Set Bedrock:Model (or Bedrock:FallbackModel) in the AI Hub's appsettings.json.");
        var client = Client(o);

        var request = new ConverseRequest
        {
            System = [.. messages.Where(m => m.Role == LlmRole.System).Select(m => new SystemContentBlock { Text = m.Text })],
            Messages = [.. messages.Where(m => m.Role != LlmRole.System).Select(m => new Message
            {
                Role = m.Role == LlmRole.Assistant ? ConversationRole.Assistant : ConversationRole.User,
                Content = [new ContentBlock { Text = m.Text }],
            })],
            InferenceConfig = new InferenceConfiguration { MaxTokens = o.MaxTokens },
        };
        var effort = string.IsNullOrWhiteSpace(o.Effort) ? null : o.Effort.Trim().ToLowerInvariant();
        if (schema is not null || effort is not null)
            request.OutputConfig = new OutputConfig
            {
                Effort = effort,
                TextFormat = schema is null ? null : new OutputFormat
                {
                    Type = OutputFormatType.Json_schema,
                    Structure = new OutputFormatStructure { JsonSchema = new JsonSchemaDefinition { Name = schema.Name, Schema = schema.Schema } },
                },
            };

        var model = o.ConfiguredModel;
        try
        {
            return await CallAsync(model);
        }
        catch (Exception e) when (IsModelUnavailable(e) && !string.IsNullOrWhiteSpace(o.FallbackModel) && model != o.FallbackModel)
        {
            logger.LogWarning("Model {Model} is not available ({Message}); using fallback {Fallback}", model, e.Message, o.FallbackModel);
            return await CallAsync(o.FallbackModel);
        }

        async Task<LlmReply> CallAsync(string name)
        {
            request.ModelId = name;
            logger.LogInformation("Bedrock: calling model {Model}{Effort} in {Region} with {Messages} messages ({Chars} characters)",
                name, effort is null ? "" : $" (effort {effort})", o.Region, messages.Count, messages.Sum(m => m.Text.Length));
            var timer = Stopwatch.StartNew();
            ConverseResponse response;
            try
            {
                response = await client.ConverseAsync(request, ct);
            }
            // Older models (such as Claude Haiku 4.5) reject effort; the fallback may be one of them.
            catch (ValidationException e) when (request.OutputConfig?.Effort is not null && e.Message.Contains("effort", StringComparison.OrdinalIgnoreCase))
            {
                logger.LogWarning("Bedrock: {Model} doesn't support effort, so asking again without it", name);
                request.OutputConfig.Effort = null;
                response = await client.ConverseAsync(request, ct);
            }
            var u = response.Usage;
            logger.LogInformation("Bedrock: {Model} answered in {Ms} ms ({InputTokens} input + {OutputTokens} output tokens, stop reason {StopReason})",
                name, timer.ElapsedMilliseconds, u?.InputTokens, u?.OutputTokens, response.StopReason?.Value);
            // Bedrock reports cache reads and writes apart from the other input tokens; UsageTracker counts them all as input.
            // Counted before the checks below: Bedrock charges for a blocked or cut-off reply too.
            var cacheRead = u?.CacheReadInputTokens ?? 0;
            var usage = usageTracker.Record(name, (u?.InputTokens ?? 0) + cacheRead + (u?.CacheWriteInputTokens ?? 0), cacheRead,
                u?.OutputTokens ?? 0, 0);

            var reason = response.StopReason;
            // A reply cut off at the token limit is incomplete, and as JSON it wouldn't parse.
            if (reason == StopReason.Max_tokens || reason == StopReason.Model_context_window_exceeded)
                throw new LlmReplyException("The model ran out of tokens before finishing its answer. Try a simpler question, or raise Bedrock:MaxTokens.");
            if (reason == StopReason.Content_filtered || reason == StopReason.Guardrail_intervened)
                throw new LlmReplyException("Bedrock's content filter or guardrail blocked the answer.");
            if (reason?.Value == "refusal")
                throw new LlmReplyException("The model refused to answer.");
            var text = string.Concat(response.Output?.Message?.Content?.Select(c => c.Text) ?? []);
            if (string.IsNullOrWhiteSpace(text))
                throw new LlmReplyException($"The model returned an empty answer (stop reason {reason?.Value}).");
            return new(text, usage);
        }
    }

    /// The model ID is wrong, or the account hasn't been given access to the model.
    static bool IsModelUnavailable(Exception e) => e is ResourceNotFoundException
        || e is ValidationException && e.Message.Contains("model", StringComparison.OrdinalIgnoreCase)
            && (e.Message.Contains("invalid", StringComparison.OrdinalIgnoreCase) || e.Message.Contains("not", StringComparison.OrdinalIgnoreCase));

    AmazonBedrockRuntimeClient Client(BedrockOptions o)
    {
        var apiKey = string.IsNullOrWhiteSpace(o.ApiKey) && string.IsNullOrWhiteSpace(o.AccessKeyId)
            ? Environment.GetEnvironmentVariable(BearerTokenVariable) ?? "" : o.ApiKey;
        return clients.GetOrAdd((o.Region.Trim(), apiKey.Trim(), o.AccessKeyId.Trim(), o.SecretAccessKey.Trim(), o.SessionToken.Trim(), o.TimeoutSeconds),
            static k =>
            {
                var config = new AmazonBedrockRuntimeConfig
                {
                    RegionEndpoint = RegionEndpoint.GetBySystemName(k.Region),
                    Timeout = TimeSpan.FromSeconds(k.TimeoutSeconds),
                };
                if (k.ApiKey.Length > 0)
                {
                    // A Bedrock API key is a bearer token, not an IAM key pair: tell the SDK to send it instead of signing.
                    config.AWSTokenProvider = new ServiceBearerStaticTokenProvider(k.ApiKey);
                    config.AuthSchemePreference = ["httpBearerAuth"];
                    return new AmazonBedrockRuntimeClient(new AnonymousAWSCredentials(), config);
                }
                if (k.AccessKeyId.Length > 0)
                {
                    AWSCredentials credentials = k.Session.Length > 0
                        ? new SessionAWSCredentials(k.AccessKeyId, k.Secret, k.Session)
                        : new BasicAWSCredentials(k.AccessKeyId, k.Secret);
                    return new AmazonBedrockRuntimeClient(credentials, config);
                }
                // AWS_ACCESS_KEY_ID, AWS_PROFILE, ~/.aws/credentials or an instance role.
                return new AmazonBedrockRuntimeClient(config);
            });
    }

    public void Dispose()
    {
        foreach (var client in clients.Values)
            client.Dispose();
    }
}
