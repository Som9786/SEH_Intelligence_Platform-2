using System.Data.Common;
using System.Diagnostics;
using System.Text.RegularExpressions;
using Insights.Analytics.Configuration;
using Insights.Analytics.Models;
using Insights.Analytics.Services.Data;
using Microsoft.Extensions.Options;

namespace Insights.Analytics.Services.Query;

/// Runs caller-supplied SQL strictly read-only: SqlGuard checks the text first, then the query runs in a transaction that
/// is always rolled back. On PostgreSQL the transaction is READ ONLY (so PostgreSQL itself refuses any write) with a
/// statement_timeout; SQL Server has no read-only transaction, so there the guard and the login's rights keep it read-only.
/// A query the database refuses or fails comes back as QueryFailedException.
public sealed partial class SqlQueryService(
    PosBasketDatabase database, IOptionsMonitor<KnowledgeModelOptions> knowledgeModel, IOptions<QueryOptions> options, ILogger<SqlQueryService> logger)
{
    /// The tables questions may read: the knowledge model's, named as they are in this database.
    public IReadOnlyList<string> Tables => knowledgeModel.CurrentValue.Tables.Select(t => database.TableName(t.Name)).ToList();

    public SqlDialect Dialect => database.Provider == DataProvider.SqlServer ? SqlDialect.SqlServer : SqlDialect.PostgreSQL;

    public async Task<QueryResult> RunReadOnlyAsync(string sql, CancellationToken ct)
    {
        logger.LogInformation("Query received ({Dialect}): {Sql}", database.Dialect, OneLine(sql));
        if (SqlGuard.RejectionReason(sql, Tables, Dialect) is { } reason)
        {
            logger.LogWarning("Query rejected: {Reason}", reason);
            throw new QueryRejectedException(reason);
        }
        try
        {
            return await RunAsync(sql, ct);
        }
        catch (DbException e) when (DatabaseErrors.Describe(e, options.Value.TimeoutSeconds) is { } error)
        {
            throw new QueryFailedException(error.Title, error.Detail, e);
        }
    }

    async Task<QueryResult> RunAsync(string sql, CancellationToken ct)
    {
        var o = options.Value;
        var timer = Stopwatch.StartNew();
        await using var conn = await database.OpenAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        if (database.Provider == DataProvider.PostgreSQL)
        {
            await using var setup = conn.CreateCommand();
            setup.Transaction = tx;
            setup.CommandText = $"SET TRANSACTION READ ONLY; SET LOCAL statement_timeout = {o.TimeoutSeconds * 1000}";
            await setup.ExecuteNonQueryAsync(ct);
        }

        // The guard allows one trailing semicolon; without it, the text is exactly one statement.
        await using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = sql.TrimEnd().TrimEnd(';');
        // PostgreSQL's statement_timeout ends the query; SQL Server's is the command timeout itself.
        cmd.CommandTimeout = database.Provider == DataProvider.PostgreSQL ? o.TimeoutSeconds + 5 : o.TimeoutSeconds;
        QueryResult result;
        var truncated = false;
        var reader = await cmd.ExecuteReaderAsync(ct);
        try
        {
            // Two columns can share a name (SELECT a.x, b.x); rows are keyed by column, so later ones get a suffix.
            var columns = new List<string>();
            for (var i = 0; i < reader.FieldCount; i++)
            {
                var name = reader.GetName(i);
                // SQL Server leaves an expression without an alias unnamed.
                if (name.Length == 0)
                    name = $"column_{i + 1}";
                for (var n = 2; columns.Contains(name); n++)
                    name = $"{reader.GetName(i)}_{n}";
                columns.Add(name);
            }
            var rows = new List<Dictionary<string, object?>>();
            while (await reader.ReadAsync(ct))
            {
                if (rows.Count == o.MaxRows)
                {
                    truncated = true;
                    break;
                }
                var row = new Dictionary<string, object?>(columns.Count);
                for (var i = 0; i < columns.Count; i++)
                    row[columns[i]] = SqlValueConverter.ToJsonValue(reader, i);
                rows.Add(row);
            }
            result = new QueryResult(columns, rows, truncated);
            // Closing the reader would otherwise read every remaining row; cancel the query so the database stops sending them.
            if (truncated)
                cmd.Cancel();
        }
        finally
        {
            try
            {
                await reader.DisposeAsync();
            }
            catch (DbException) when (truncated)
            {
                // The cancel above, as expected.
            }
        }
        await tx.RollbackAsync(ct);

        logger.LogInformation("Query returned {Rows} rows, columns [{Columns}]{Truncated} in {Ms} ms",
            result.Rows.Count, string.Join(", ", result.Columns), result.Truncated ? $" (cut at Query:MaxRows {o.MaxRows})" : "",
            timer.ElapsedMilliseconds);
        return result;
    }

    /// SQL on one line, for logs.
    static string OneLine(string sql) => Whitespace().Replace(sql, " ").Trim();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
