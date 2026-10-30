namespace Insights.Analytics.Services.Ask;

/// The SQL the AI wrote was rejected or failed in the database. Carries the query so the caller can show or fix it.
public sealed class AskQueryException(string title, string message, string sql, string explanation) : Exception(message)
{
    public string Title { get; } = title;
    public string Sql { get; } = sql;
    public string Explanation { get; } = explanation;
}
