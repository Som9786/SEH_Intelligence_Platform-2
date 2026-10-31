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
