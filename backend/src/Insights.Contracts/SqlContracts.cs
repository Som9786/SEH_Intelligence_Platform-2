using System.Text.Json;

namespace Insights.Contracts;

/// Body of the AI Hub's POST /sql. Context is the part of the knowledge model the question is about, as Analytics' POST
/// /context returns it: Analytics adds it, so the AI Hub never calls back for it. History holds earlier questions in the
/// same conversation and their queries, oldest first, so a follow-up such as "and for store 123?" can build on them.
/// FailedSql and Error ask for a corrected query after the database rejected one written for this question.
public sealed record SqlRequest(string Question, JsonElement? Context = null, IReadOnlyList<ConversationTurn>? History = null,
    string? FailedSql = null, string? Error = null);

/// One earlier question and the query that answered it.
public sealed record ConversationTurn(string Question, string Sql);

/// Response of POST /sql. When Answerable is false, Sql is empty and Explanation says why. Title is a short heading for
/// the result, such as "Top 5 Stores by Net Sales" (null in replies cached before it was asked for).
/// Usage is the tokens and cost of the model call, and Cached is true when the query was reused without calling the model
/// (Usage is then null). KnowledgeModel names the concepts and metrics the model was given. None of these three is part of
/// the model's own reply.
public sealed record SqlResponse(bool Answerable, string Sql, string Explanation, LlmUsage? Usage = null, bool Cached = false,
    IReadOnlyList<string>? KnowledgeModel = null, string? Title = null);

/// Body of POST /answer. Results is Analytics' /query response, passed through as raw JSON.
public sealed record AnswerRequest(string Question, string? Sql, JsonElement Results);

/// Response of POST /answer. Usage is the tokens and cost of the model call; null with Cached = true when the same
/// question, query and results were answered before.
public sealed record AnswerResponse(string Answer, LlmUsage? Usage, bool Cached = false);

/// Body of POST /recommendations: the question, the answer shown, and the Analytics /query response it was drawn from.
/// Baseline is a second query's rows that set the answer's rows against a benchmark (the chain average, the previous
/// period), or null when there is none. From and To are the first and last business date in the data, and Rules the
/// business rules for the question, so the model knows what the data covers. Analytics' POST /recommend adds them all.
public sealed record RecommendationRequest(string Question, string? Answer, JsonElement Results, JsonElement? Baseline = null,
    string? From = null, string? To = null, IReadOnlyList<string>? Rules = null);

/// One thing to do about an answer: the action, the figures from the results that call for it, the team that would act
/// on it (one of Owners.All) and how pressing it is ("high", "medium" or "low").
public sealed record Recommendation(string Action, string Why, string Owner, string Priority);

/// Response of POST /recommendations: up to three actions, most pressing first, or none when the results call for none.
/// DataNote says what to bear in mind about the data itself (a partial last day, too few days for a trend), kept out of
/// the actions; null when there is nothing to say. Usage and Cached are as for POST /answer.
public sealed record RecommendationResponse(
    IReadOnlyList<Recommendation> Recommendations, string? DataNote = null, LlmUsage? Usage = null, bool Cached = false);

/// The teams a recommendation can be for.
public static class Owners
{
    public static readonly string[] All = ["Merchandising", "Promotions", "Store Operations", "Loss Prevention", "Fuel", "Finance"];
}
