using System.Text.Json;
using Insights.AiHub.Configuration;
using Insights.AiHub.Models;
using Insights.AiHub.Services.Llm;
using Microsoft.Extensions.Options;

namespace Insights.AiHub.Services.Answer;

/// Question + the answer shown + its query results (and a baseline query's, which set them against a benchmark) -> up to
/// three actions a business team could take, each backed by figures from the results, and a note about the data itself.
/// Asked after the answer is shown, so it never delays it. The same request is answered from the cache.
public sealed class RecommendationService(
    LlmClient llm, ResponseCache<RecommendationResponse> cache, IOptions<AnswerOptions> options, ILogger<RecommendationService> logger)
{
    public const int MaxRecommendations = 3;
    static readonly string[] Priorities = ["high", "medium", "low"];

    public async Task<RecommendationResponse> RecommendAsync(RecommendationRequest request, CancellationToken ct)
    {
        var results = Json(request.Results);
        var baseline = request.Baseline is { } b ? Json(b) : null;
        var answer = request.Answer ?? "";
        var rules = request.Rules is { Count: > 0 } ? string.Join('\n', request.Rules.Select(r => $"- {r}")) : "";
        var cacheKey = ResponseCache<RecommendationResponse>.KeyOf(
            ResponseCache<RecommendationResponse>.Normalize(request.Question), answer, results, baseline, request.From, request.To, rules);
        if (cache.Get(cacheKey) is { } cached)
        {
            logger.LogInformation("Recommendations: reusing the actions suggested earlier (no model call)");
            return cached with { Usage = null, Cached = true };
        }

        // Both sets of rows share the result limit, so the prompt stays the size of one answer's.
        var max = options.Value.MaxResultChars / (baseline is null ? 1 : 2);
        List<LlmMessage> messages =
        [
            LlmMessage.System(System),
            LlmMessage.User($"""
                Question: {request.Question}

                Answer shown: {answer}

                Data covers: {(request is { From: { } from, To: { } to } ? $"{from} to {to} ({Days(from, to)})" : "unknown dates")}

                {(rules.Length > 0 ? $"Business rules for this question:\n{rules}\n" : "")}
                Results (JSON):
                {Cut(results, max)}

                Baseline, the same rows against a benchmark (JSON):
                {(baseline is null ? "(none: compare the rows with each other only)" : Cut(baseline, max))}
                """),
        ];
        var schema = new LlmJsonSchema("recommendations", ResponseSchema);

        logger.LogInformation("Recommendations: suggesting actions after \"{Question}\" ({Baseline})", request.Question,
            baseline is null ? "no baseline" : "with a baseline");
        var reply = await llm.CompleteAsync(messages, schema, ct);
        var suggested = JsonSerializer.Deserialize<RecommendationResponse>(reply.Text, JsonSerializerOptions.Web);
        var response = new RecommendationResponse(
            (suggested?.Recommendations ?? []).Where(r => !string.IsNullOrWhiteSpace(r.Action) && !string.IsNullOrWhiteSpace(r.Why))
                .Select(r => r with
                {
                    Action = r.Action.Trim(),
                    Why = r.Why.Trim(),
                    Owner = Owners.All.FirstOrDefault(o => o.Equals(r.Owner?.Trim(), StringComparison.OrdinalIgnoreCase)) ?? Owners.All[0],
                    Priority = Priorities.FirstOrDefault(p => p.Equals(r.Priority?.Trim(), StringComparison.OrdinalIgnoreCase)) ?? "medium",
                })
                .OrderBy(r => Array.IndexOf(Priorities, r.Priority))
                .Take(MaxRecommendations).ToList(),
            string.IsNullOrWhiteSpace(suggested?.DataNote) ? null : suggested.DataNote.Trim(),
            reply.Usage);
        logger.LogInformation("Recommendations: {Actions}; data note: {Note}",
            string.Join(" | ", response.Recommendations.Select(r => $"{r.Priority}: {r.Action}")), response.DataNote ?? "none");
        cache.Set(cacheKey, response);
        return response;
    }

    static string Json(JsonElement json) => json.ValueKind == JsonValueKind.Undefined ? "null" : json.GetRawText();

    string Cut(string json, int max)
    {
        if (json.Length <= max)
            return json;
        logger.LogInformation("Recommendations: rows cut to {Max} characters before sending to the model", max);
        return json[..max] + "\n[results truncated]";
    }

    static string Days(string from, string to) =>
        DateOnly.TryParse(from, out var f) && DateOnly.TryParse(to, out var t) ? $"{t.DayNumber - f.DayNumber + 1} days" : "unknown length";

    static readonly string System = $"""
        You advise the business teams of a 7-Eleven convenience store chain. You get a question about its point-of-sale
        data, the answer it was given, the query results behind it, and usually a baseline: the same rows set against a
        benchmark (the chain average, the previous period). Suggest up to {MaxRecommendations} actions the business could
        take because of these results, and say separately anything to bear in mind about the data itself.

        What the data can show: baskets, items, units, sales, discounts, offers, payment types and returns, by store, day
        and hour. It has no stock levels, staffing, costs or margins, prices paid to suppliers, or customer details, so
        never base an action on those or guess at them as causes.

        Each action must be one of these kinds, and say exactly what to do, where:
        - place or bundle two items that are often bought together (complements, such as a snack and a drink; never two
          similar items that one buys instead of the other, such as two kinds of musubi);
        - change, extend or stop an offer, from how much it costs in discount and how often it is used;
        - plan staff for a store's busiest hours or days;
        - check a store's returns, discounts, voids or rewards that are far above the chain's;
        - stock up on items ahead of a day or time when they sell far more;
        - copy what a store that is far ahead of the chain on a measure does, at stores far behind it.

        Rules:
        - Act only on a clear gap: a row well above or below its benchmark (in the baseline, or against the other rows).
          "why" quotes that gap with both figures, such as "avg basket $8.10 vs $11.40 chain-wide (-29%)". Never invent,
          estimate or average numbers yourself; use only figures in the results or baseline.
        - "action" names the store, item, offer, day or hour, and the concrete step. At most 15 words. Never start with
          "investigate", "review", "ensure", "assess", "monitor" or "consider" unless the same sentence says exactly what
          to check and where; never give advice that would fit any result.
        - "why" is at most 20 words.
        - A pattern by day of week, or a trend, needs at least 3 weeks of data (see "Data covers"); with less, don't act
          on it.
        - The last date in the data is often a partial day. A low figure on that date is not a business problem: never
          make it an action; say it in dataNote instead.
        - "owner" is the team that would act: one of {string.Join(", ", Owners.All)}.
        - "priority": "high" for a gap of 25% or more, or a cost or loss worth acting on this week; "medium" for a gap of
          10-25%; "low" for a smaller gap worth a look.
        - Return no actions when nothing in the results calls for one (a single total, rows that are all close to their
          benchmark). An empty list is better than a weak action.
        - dataNote is one short sentence about the data, such as a partial last day, truncated results, or too few days
          for a trend; an empty string when there is nothing to say. Never put actions in it.
        - Use plain business language; don't mention SQL, queries, tables, columns or JSON.

        Good actions:
        - action "Put SPAM Musubi next to AriZona Green Tea at stores 54274 and 54256", why "Bought together in 9% of
          Musubi baskets there vs 22% chain-wide", owner Merchandising, priority high.
        - action "Stop offer 4471 or cut its discount", why "$4,210 discount but its baskets average $9.80 vs $9.90
          without it", owner Promotions, priority high.
        - action "Add a second cashier 7-9am at store 54297", why "38% of its baskets fall in 7-9am vs 24% chain-wide",
          owner Store Operations, priority medium.
        Weak actions, never give these:
        - "Investigate stores 54274 and 54256 for staffing or supply gaps" (no figure, guesses a cause the data can't show).
        - "Review assortment and promotions at store 54297 to replicate chain-wide" (fits any result).
        - "Bundle SPAM Musubi with SPAM Katsu Musubi" (similar items that replace each other).
        - "Investigate the Aug 22 drop" when Aug 22 is the last date in the data (a partial day: a dataNote, not an action).
        """;

    const string ResponseSchema = """
        {
          "type": "object",
          "properties": {
            "recommendations": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "action": { "type": "string" },
                  "why": { "type": "string" },
                  "owner": { "type": "string" },
                  "priority": { "type": "string", "enum": ["high", "medium", "low"] }
                },
                "required": ["action", "why", "owner", "priority"],
                "additionalProperties": false
              }
            },
            "dataNote": { "type": "string" }
          },
          "required": ["recommendations", "dataNote"],
          "additionalProperties": false
        }
        """;
}
