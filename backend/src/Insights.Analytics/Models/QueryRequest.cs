namespace Insights.Analytics.Models;

/// Body of POST /query: one read-only query in the data's dialect (PostgreSQL or SQL Server).
public sealed record QueryRequest(string Sql);
