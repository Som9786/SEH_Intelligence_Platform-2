using System.Text.Json;
using Insights.AiHub.Models;
using Insights.AiHub.Services.Llm;

namespace Insights.AiHub.Services.Routing;

/// Question + the answer shown -> up to three questions to ask next, of the kinds Analytics and DB Guide can answer. Asked
/// after the answer is shown, so it never delays it. The same question and answer are answered from the cache.
public sealed class FollowUpService(LlmClient llm, ServiceProfiles profiles, ResponseCache<FollowUpResponse> cache, ILogger<FollowUpService> logger)
{
    public const int MaxQuestions = 3;
    /// Enough of the answer to know what it said; the rest only costs tokens.
    const int MaxAnswerChars = 2000;

    public async Task<FollowUpResponse> SuggestAsync(FollowUpRequest request, CancellationToken ct)
    {
        var answer = request.Answer ?? "";
        if (answer.Length > MaxAnswerChars)
            answer = answer[..MaxAnswerChars] + "…";
        var columns = request.Columns is { Count: > 0 } ? string.Join(", ", request.Columns) : "";
        var cacheKey = ResponseCache<FollowUpResponse>.KeyOf(
            ResponseCache<FollowUpResponse>.Normalize(request.Question), request.Intent, answer, columns);
        if (cache.Get(cacheKey) is { } cached)
        {
            logger.LogInformation("Follow-ups: reusing the questions suggested earlier (no model call)");
            return cached with { Usage = null, Cached = true };
        }

        var analytics = await profiles.AnalyticsAsync(ct);
        var dbGuide = await profiles.DbGuideAsync(ct);
        List<LlmMessage> messages =
        [
            LlmMessage.System(System(analytics, dbGuide)),
            LlmMessage.User($"""
                Question ({request.Intent ?? "unknown"}): {request.Question}
                {(columns.Length > 0 ? $"Result columns: {columns}\n" : "")}Answer:
                {answer}
                """),
        ];
        var schema = new LlmJsonSchema("follow_up_questions", ResponseSchema);

        logger.LogInformation("Follow-ups: suggesting questions after \"{Question}\"", request.Question);
        var reply = await llm.CompleteAsync(messages, schema, ct);
        var questions = JsonSerializer.Deserialize<FollowUpResponse>(reply.Text, JsonSerializerOptions.Web)?.Questions ?? [];
        var response = new FollowUpResponse(
            questions.Select(q => q.Trim()).Where(q => q.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase).Take(MaxQuestions).ToList(),
            reply.Usage);
        logger.LogInformation("Follow-ups: {Questions}", string.Join(" | ", response.Questions));
        cache.Set(cacheKey, response);
        return response;
    }

    static string System(ServiceProfile? analytics, ServiceProfile? dbGuide) => $"""
        You suggest what to ask next in the SEH Intelligence Platform's Insights Assistant, after a question and the
        answer it got. Suggest up to {MaxQuestions} short follow-up questions that dig further into this answer: a breakdown
        (by store, item, day or hour), a comparison, a trend, the top or bottom items, or for a question about the
        database, the next table, column or join to look at.

        The assistant answers two kinds of question. Each suggestion must be one of them:
        - about the sales data ({analytics?.Name ?? "point-of-sale baskets"}), such as:
        {Examples(analytics)}
        - about the structure of the {dbGuide?.Name ?? "retail"} database, such as:
        {Examples(dbGuide)}

        Rules:
        - Each question stands on its own: name the store, item or table rather than saying "it" or "that".
        - At most 15 words each, ending with a question mark. Don't repeat the question that was asked.
        - Return fewer, or none, when the answer leaves nothing sensible to ask.
        """;

    static string Examples(ServiceProfile? profile) =>
        profile is { Suggestions.Count: > 0 }
            ? string.Join('\n', profile.Suggestions.Take(5).Select(s => $"    - {s}"))
            : "    (no examples available)";

    const string ResponseSchema = """
        {
          "type": "object",
          "properties": {
            "questions": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["questions"],
          "additionalProperties": false
        }
        """;
}
