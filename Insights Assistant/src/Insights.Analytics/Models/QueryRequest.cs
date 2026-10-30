namespace Insights.Analytics.Models;

/// Body of POST /query: one read-only PostgreSQL query.
public sealed record QueryRequest(string Sql);
