using System.Data.Common;
using Microsoft.Data.SqlClient;
using Npgsql;

namespace Insights.Analytics.Services.Query;

/// The database's error for a query, as a title and detail the Q&A page shows and the AI reads to correct its query.
public static class DatabaseErrors
{
    /// Null when the error isn't about the query (the connection failed), so it's reported as the database being down.
    public static (string Title, string Detail)? Describe(DbException e, int timeoutSeconds) => e switch
    {
        PostgresException { SqlState: PostgresErrorCodes.QueryCanceled } => TooLong("PostgreSQL", timeoutSeconds),
        PostgresException { SqlState: PostgresErrorCodes.ReadOnlySqlTransaction } p => ("Query rejected", "Only read-only queries can run: " + p.MessageText),
        PostgresException p => ($"PostgreSQL error {p.SqlState}",
            p.MessageText + (string.IsNullOrEmpty(p.Hint) ? "" : $" Hint: {p.Hint}") + (p.Position > 0 ? $" (at character {p.Position})" : "")),
        // -2 is SqlClient's own timeout; classes 11 to 16 are errors in the query itself, higher ones are the server's.
        SqlException { Number: -2 } => TooLong("SQL Server", timeoutSeconds),
        SqlException { Class: >= 11 and <= 16 } s => ($"SQL Server error {s.Number}", s.Message),
        _ => null,
    };

    static (string, string) TooLong(string database, int timeoutSeconds) => ("Query took too long",
        $"{database} cancelled the query after Query:TimeoutSeconds ({timeoutSeconds} s). Narrow it down, e.g. to fewer days, stores or items.");
}

/// The database refused or failed a query; Title and Message are what DatabaseErrors made of its error.
public sealed class QueryFailedException(string title, string detail, Exception inner) : Exception(detail, inner)
{
    public string Title { get; } = title;
}
