using System.Text.Json;

namespace Insights.Analytics.Models;

// Same shapes as the AI Hub's own requests and responses; Analytics passes them through.

/// Body of POST /ai/sql. History holds earlier questions in the conversation and their queries, oldest first, for a
/// follow-up. FailedSql and Error ask for a corrected query after PostgreSQL rejected one written for this question.
public sealed record SqlRequest(string Question, IReadOnlyList<ConversationTurn>? History = null, string? FailedSql = null, string? Error = null);

/// One earlier question and the query that answered it.
public sealed record ConversationTurn(string Question, string Sql);

/// Response of POST /ai/sql. When Answerable is false, Sql is empty and Explanation says why.
/// Cached is true when the AI Hub reused an earlier query for the same question without calling OpenAI (Usage is then null).
/// Knowledge model names the concepts and metrics the AI was given for this question.
public sealed record SqlResponse(bool Answerable, string Sql, string Explanation, LlmUsage? Usage, bool Cached = false,
    IReadOnlyList<string>? KnowledgeModel = null);

/// Body of POST /ai/answer. Results is a /query response, passed through as raw JSON.
public sealed record AnswerRequest(string Question, string? Sql, JsonElement Results);

/// Response of POST /ai/answer. Cached is true when the same question, query and results were answered before.
public sealed record AnswerResponse(string Answer, LlmUsage? Usage, bool Cached = false);

/// Tokens and cost of one OpenAI call. CostUsd is null when the AI Hub has no price for the model (OpenAI:Prices).
public sealed record LlmUsage(string Model, int InputTokens, int CachedInputTokens, int OutputTokens, int ReasoningTokens, decimal? CostUsd);

/// Response of GET /ai/health.
public sealed record AiHealthResponse(string Status, string Model);

/// Body of POST /ask. History holds earlier questions and their queries, oldest first, for a follow-up question.
/// Explain = false skips the AI's plain-English explanation (Answer is then null), which saves most of a question's cost.
public sealed record AskRequest(string Question, IReadOnlyList<ConversationTurn>? History = null, bool Explain = true);

/// Response of POST /ask. Result is null, and Answer too, when the question can't be answered from the data;
/// Answer alone is null when the request set Explain = false.
/// CostUsd is the OpenAI cost of the question's model calls (0 when all were cached), or null when a call's cost is unknown.
/// Corrected is true when PostgreSQL rejected the first query and the AI wrote this one to fix it.
/// FetchedAt is when the query's rows were read from PostgreSQL (null when no query ran).
public sealed record AskResponse(string Question, bool Answerable, string Sql, string Explanation, QueryResult? Result, string? Answer,
    decimal? CostUsd, bool Corrected = false, IReadOnlyList<string>? KnowledgeModel = null, DateTimeOffset? FetchedAt = null);
