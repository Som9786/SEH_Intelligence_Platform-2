namespace Insights.AiHub.Models;

/// Body of POST /sql. History holds earlier questions in the same conversation and their queries, oldest first,
/// so a follow-up such as "and for store 123?" can build on them. FailedSql and Error ask for a corrected query
/// after PostgreSQL rejected one written for this question.
public sealed record SqlRequest(string Question, IReadOnlyList<ConversationTurn>? History = null, string? FailedSql = null, string? Error = null);

/// One earlier question and the query that answered it.
public sealed record ConversationTurn(string Question, string Sql);

/// Response of POST /sql. When Answerable is false, Sql is empty and Explanation says why.
/// Usage is the tokens and cost of the model call, and Cached is true when the query was reused without calling OpenAI;
/// Knowledge model names the concepts and metrics the model was given. None of these three is part of the model's own reply.
public sealed record SqlResponse(bool Answerable, string Sql, string Explanation, LlmUsage? Usage = null, bool Cached = false,
    IReadOnlyList<string>? KnowledgeModel = null);
