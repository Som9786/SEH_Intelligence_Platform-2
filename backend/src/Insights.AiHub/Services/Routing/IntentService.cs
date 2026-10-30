using System.Text.Json;
using Insights.AiHub.Models;
using Insights.AiHub.Services.Llm;

namespace Insights.AiHub.Services.Routing;

/// Question -> its intent: about the sales data (Analytics), about the database's structure (DB Catalog), or unclear. One
/// small model call; a question asked again without history is answered from the cache.
public sealed class IntentService(LlmClient llm, ResponseCache<IntentResponse> cache, ILogger<IntentService> logger)
{
    /// Earlier turns shown to the model; enough to read a follow-up.
    const int MaxHistory = 3;

    public async Task<IntentResponse> ClassifyAsync(RouteRequest request, CancellationToken ct)
    {
        var history = request.History?.TakeLast(MaxHistory).ToList() ?? [];
        var (analytics, dbCatalog) = (request.Analytics, request.DbCatalog);

        // The services' names are in the key, so a different dataset or database classifies afresh.
        var cacheKey = history.Count == 0
            ? ResponseCache<IntentResponse>.KeyOf(analytics?.Name, dbCatalog?.Name, ResponseCache<IntentResponse>.Normalize(request.Question))
            : null;
        if (cacheKey is not null && cache.Get(cacheKey) is { } cached)
        {
            logger.LogInformation("Intent: reusing the intent given earlier for \"{Question}\": {Intent} (no model call)", request.Question, cached.Intent);
            return cached with { Usage = null, Cached = true };
        }

        var earlier = history.Count == 0
            ? ""
            : "Earlier questions, oldest first:\n" + string.Join('\n', history.Select(t => $"- [{t.Intent ?? "unknown"}] {t.Question}")) + "\n\nLatest question:\n";
        List<LlmMessage> messages =
        [
            LlmMessage.System(IntentPrompt.System(analytics, dbCatalog)),
            LlmMessage.User(earlier + request.Question),
        ];
        var schema = new LlmJsonSchema("question_intent", IntentPrompt.ResponseSchema);

        logger.LogInformation("Intent: classifying \"{Question}\"{History}", request.Question,
            history.Count > 0 ? $" with {history.Count} earlier questions" : "");
        var reply = await llm.CompleteAsync(messages, schema, ct);
        var response = JsonSerializer.Deserialize<IntentResponse>(reply.Text, JsonSerializerOptions.Web) is { } r
            ? r with { Usage = reply.Usage }
            : throw new LlmReplyException("The model's intent could not be read.");
        logger.LogInformation("Intent: {Intent} ({Reason})", response.Intent, response.Reason);
        if (cacheKey is not null)
            cache.Set(cacheKey, response);
        return response;
    }
}
