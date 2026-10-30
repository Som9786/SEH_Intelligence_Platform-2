namespace Insights.Analytics.Configuration;

/// Limits for read-only SQL run on PostgreSQL through /query.
public sealed class QueryOptions
{
    public const string SectionName = "Query";

    public int MaxRows { get; set; } = 1000;
    /// PostgreSQL cancels a query that runs longer than this (statement_timeout).
    public int TimeoutSeconds { get; set; } = 30;
}
