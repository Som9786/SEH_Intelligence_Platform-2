using System.Text.Json;
using Insights.AiHub.Models;
using Insights.AiHub.Services.Llm;
using OpenAI.Chat;

namespace Insights.AiHub.Services.Routing;

/// Question -> its intent: about the sales data (Analytics), about the database's structure (DB Guide), or unclear. One
/// small model call; a question asked again without history is answered from the cache.
public sealed class IntentService(LlmClient llm, ServiceProfiles profiles, ResponseCache<IntentResponse> cache, ILogger<IntentService> logger)
{
    /// Earlier turns shown to the model; enough to read a follow-up.
    const int MaxHistory = 3;

    public async Task<IntentResponse> ClassifyAsync(RouteRequest request, CancellationToken ct)
    {
        var history = request.History?.TakeLast(MaxHistory).ToList() ?? [];
        var analytics = await profiles.AnalyticsAsync(ct);
        var dbGuide = await profiles.DbGuideAsync(ct);

        // The services' names are in the key, so a different dataset or database classifies afresh.
        var cacheKey = history.Count == 0
            ? ResponseCache<IntentResponse>.KeyOf(analytics?.Name, dbGuide?.Name, ResponseCache<IntentResponse>.Normalize(request.Question))
            : null;
        if (cacheKey is not null && cache.Get(cacheKey) is { } cached)
        {
            logger.LogInformation("Intent: reusing the intent given earlier for \"{Question}\": {Intent} (no OpenAI call)", request.Question, cached.Intent);
            return cached with { Usage = null, Cached = true };
        }

        var earlier = history.Count == 0
            ? ""
            : "Earlier questions, oldest first:\n" + string.Join('\n', history.Select(t => $"- [{t.Intent ?? "unknown"}] {t.Question}")) + "\n\nLatest question:\n";
        List<ChatMessage> messages =
        [
            new SystemChatMessage(IntentPrompt.System(analytics, dbGuide)),
            new UserChatMessage(earlier + request.Question),
        ];
        var options = new ChatCompletionOptions
        {
            ResponseFormat = ChatResponseFormat.CreateJsonSchemaFormat(
                "question_intent", BinaryData.FromString(IntentPrompt.ResponseSchema), jsonSchemaIsStrict: true),
        };

        logger.LogInformation("Intent: classifying \"{Question}\"{History}", request.Question,
            history.Count > 0 ? $" with {history.Count} earlier questions" : "");
        var reply = await llm.CompleteAsync(messages, options, ct);
        var response = JsonSerializer.Deserialize<IntentResponse>(reply.Text, JsonSerializerOptions.Web) is { } r
            ? r with { Usage = reply.Usage }
            : throw new LlmReplyException("The model's intent could not be read.");
        logger.LogInformation("Intent: {Intent} ({Reason})", response.Intent, response.Reason);
        if (cacheKey is not null)
            cache.Set(cacheKey, response);
        return response;
    }
}
