namespace Insights.Analytics.Configuration;

/// Limits for read-only SQL run on the data's database through /query.
public sealed class QueryOptions
{
    public const string SectionName = "Query";

    public int MaxRows { get; set; } = 1000;
    /// The database cancels a query that runs longer than this (statement_timeout on PostgreSQL, the command timeout on SQL Server).
    public int TimeoutSeconds { get; set; } = 30;
}
