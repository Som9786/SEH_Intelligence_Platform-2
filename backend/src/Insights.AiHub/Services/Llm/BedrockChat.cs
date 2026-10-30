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
    // Models that answered "does not support the effort parameter", so effort isn't sent to them again.
    readonly ConcurrentDictionary<string, bool> rejectsEffort = new(StringComparer.OrdinalIgnoreCase);

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

        var system = messages.Where(m => m.Role == LlmRole.System).Select(m => new SystemContentBlock { Text = m.Text }).ToList();
        var conversation = messages.Where(m => m.Role != LlmRole.System).Select(m => new Message
        {
            Role = m.Role == LlmRole.Assistant ? ConversationRole.Assistant : ConversationRole.User,
            Content = [new ContentBlock { Text = m.Text }],
        }).ToList();
        var format = schema is null ? null : new OutputFormat
        {
            Type = OutputFormatType.Json_schema,
            Structure = new OutputFormatStructure { JsonSchema = new JsonSchemaDefinition { Name = schema.Name, Schema = schema.Schema } },
        };
        var effort = string.IsNullOrWhiteSpace(o.Effort) ? null : o.Effort.Trim().ToLowerInvariant();

        // One deadline for every attempt (the SDK's retry, the effort retry and the fallback), so a call never outlasts
        // Bedrock:TimeoutSeconds, which is kept under the time Analytics waits.
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(o.TimeoutSeconds));

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
            var sendEffort = effort is not null && !rejectsEffort.ContainsKey(name);
            logger.LogInformation("Bedrock: calling model {Model}{Effort} in {Region} with {Messages} messages ({Chars} characters)",
                name, sendEffort ? $" (effort {effort})" : "", o.Region, messages.Count, messages.Sum(m => m.Text.Length));
            var timer = Stopwatch.StartNew();
            ConverseResponse response;
            try
            {
                response = await SendAsync(name, sendEffort ? effort : null);
            }
            // Older models (such as Claude Haiku 4.5) reject effort, and the fallback may be one of them. Remembered, so
            // later calls to the same model don't pay for the rejected round trip.
            catch (ValidationException e) when (sendEffort && e.Message.Contains("effort", StringComparison.OrdinalIgnoreCase))
            {
                logger.LogWarning("Bedrock: {Model} doesn't support effort, so asking again without it", name);
                rejectsEffort[name] = true;
                response = await SendAsync(name, null);
            }
            var u = response.Usage;
            logger.LogInformation("Bedrock: {Model} answered in {Ms} ms ({InputTokens} input + {OutputTokens} output tokens, stop reason {StopReason})",
                name, timer.ElapsedMilliseconds, u?.InputTokens, u?.OutputTokens, response.StopReason?.Value);
            // Bedrock reports cache reads and writes apart from the other input tokens; UsageTracker counts them all as input.
            // Counted before the checks below: Bedrock charges for a blocked or cut-off reply too.
            var cacheRead = u?.CacheReadInputTokens ?? 0;
            var cacheWrite = u?.CacheWriteInputTokens ?? 0;
            var usage = usageTracker.Record(Name, name, (u?.InputTokens ?? 0) + cacheRead + cacheWrite, cacheRead, u?.OutputTokens ?? 0, 0, cacheWrite);

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

        async Task<ConverseResponse> SendAsync(string name, string? withEffort)
        {
            var request = new ConverseRequest
            {
                ModelId = name,
                System = system,
                Messages = conversation,
                InferenceConfig = new InferenceConfiguration { MaxTokens = o.MaxTokens },
                OutputConfig = format is null && withEffort is null ? null : new OutputConfig { TextFormat = format, Effort = withEffort },
            };
            try
            {
                return await client.ConverseAsync(request, deadline.Token);
            }
            // The deadline above, not the caller hanging up: reported as the model's timeout.
            catch (OperationCanceledException) when (deadline.IsCancellationRequested && !ct.IsCancellationRequested)
            {
                throw new TimeoutException($"Bedrock did not answer within {o.TimeoutSeconds} seconds (Bedrock:TimeoutSeconds).");
            }
            // DNS, a proxy or firewall: reported as Bedrock being unreachable, with its region.
            catch (HttpRequestException e)
            {
                throw new BedrockUnreachableException($"Could not reach Bedrock in {o.Region}: {e.Message}", e);
            }
        }
    }

    /// Only "this model doesn't exist" or "this account may not call this model", where another model can still answer.
    /// Other rejections (too long, a bad schema) would fail the same way on the fallback, so they're reported as they are.
    static bool IsModelUnavailable(Exception e) => e switch
    {
        ResourceNotFoundException => true,
        AccessDeniedException => e.Message.Contains("bedrock:InvokeModel", StringComparison.OrdinalIgnoreCase),
        ValidationException => e.Message.Contains("model identifier is invalid", StringComparison.OrdinalIgnoreCase)
            || e.Message.Contains("end of its life", StringComparison.OrdinalIgnoreCase),
        _ => false,
    };

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
                    // One retry for throttling or a dropped connection; CompleteAsync's deadline bounds the total time.
                    MaxErrorRetry = 1,
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

/// The Bedrock endpoint couldn't be reached at all: DNS, a proxy or firewall, or no network.
public sealed class BedrockUnreachableException(string message, Exception inner) : Exception(message, inner);
