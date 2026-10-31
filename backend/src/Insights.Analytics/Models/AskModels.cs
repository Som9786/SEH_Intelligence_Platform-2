using Insights.Contracts;

namespace Insights.Analytics.Models;

/// Body of POST /ask. History holds earlier questions and their queries, oldest first, for a follow-up question.
/// Explain = false skips the AI's plain-English explanation (Answer is then null), which saves most of a question's cost.
public sealed record AskRequest(string Question, IReadOnlyList<ConversationTurn>? History = null, bool Explain = true);

/// Response of POST /ask. Result is null, and Answer too, when the question can't be answered from the data;
/// Answer alone is null when the request set Explain = false.
/// CostUsd is the model cost of the question's model calls (0 when all were cached), or null when a call's cost is unknown.
/// Corrected is true when the database rejected the first query and the AI wrote this one to fix it.
/// FetchedAt is when the query's rows were read from the database (null when no query ran).
/// Title is the AI's short heading for the result, such as "Top 5 Stores by Net Sales" (null when it gave none).
public sealed record AskResponse(string Question, bool Answerable, string Sql, string Explanation, QueryResult? Result, string? Answer,
    decimal? CostUsd, bool Corrected = false, IReadOnlyList<string>? KnowledgeModel = null, DateTimeOffset? FetchedAt = null,
    string? Title = null);

/// Body of POST /recommend: an answer as POST /ask returned it (the question, its query, the answer and the rows).
public sealed record RecommendRequest(string Question, string? Sql, string? Answer, QueryResult? Result);

/// Response of POST /recommend: up to three actions and a note about the data (see the AI Hub's RecommendationResponse).
/// BaselineSql is the query that set the rows against a benchmark, or null when none could be run. CostUsd is as for /ask.
public sealed record RecommendResponse(
    IReadOnlyList<Recommendation> Recommendations, string? DataNote, string? BaselineSql, decimal? CostUsd);
