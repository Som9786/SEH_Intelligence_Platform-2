using Npgsql;

namespace Insights.Analytics.Services.Query;

/// PostgreSQL's error for a query, as a title and detail the Q&A page shows and the AI reads to correct its query.
public static class PostgresErrors
{
    public static (string Title, string Detail) Describe(PostgresException e, int timeoutSeconds) => e.SqlState switch
    {
        PostgresErrorCodes.QueryCanceled => ("Query took too long",
            $"PostgreSQL cancelled the query after Query:TimeoutSeconds ({timeoutSeconds} s). Narrow it down, e.g. to fewer days, stores or items."),
        PostgresErrorCodes.ReadOnlySqlTransaction => ("Query rejected", "Only read-only queries can run: " + e.MessageText),
        _ => ($"PostgreSQL error {e.SqlState}",
            e.MessageText + (string.IsNullOrEmpty(e.Hint) ? "" : $" Hint: {e.Hint}") + (e.Position > 0 ? $" (at character {e.Position})" : "")),
    };
}
