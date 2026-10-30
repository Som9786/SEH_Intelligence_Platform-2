using System.Diagnostics;
using System.Text.RegularExpressions;
using Insights.Analytics.Configuration;
using Insights.Analytics.Models;
using Insights.Analytics.Services.Data;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Insights.Analytics.Services.Query;

/// Runs caller-supplied SQL on PostgreSQL strictly read-only: SqlGuard checks the text first, then the query runs in a
/// READ ONLY transaction (so PostgreSQL itself refuses any write) with a statement_timeout, and is always rolled back.
public sealed partial class SqlQueryService(
    PosBasketDatabase database, IOptionsMonitor<KnowledgeModelOptions> knowledgeModel, IOptions<QueryOptions> options, ILogger<SqlQueryService> logger)
{
    /// The tables questions may read: the knowledge model's.
    public IReadOnlyList<string> Tables => knowledgeModel.CurrentValue.Tables.Select(t => t.Name).ToList();

    public async Task<QueryResult> RunReadOnlyAsync(string sql, CancellationToken ct)
    {
        logger.LogInformation("Query received: {Sql}", OneLine(sql));
        if (SqlGuard.RejectionReason(sql, Tables) is { } reason)
        {
            logger.LogWarning("Query rejected: {Reason}", reason);
            throw new QueryRejectedException(reason);
        }

        var o = options.Value;
        var timer = Stopwatch.StartNew();
        await using var conn = await database.OpenAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await using (var setup = new NpgsqlCommand($"SET TRANSACTION READ ONLY; SET LOCAL statement_timeout = {o.TimeoutSeconds * 1000}", conn, tx))
            await setup.ExecuteNonQueryAsync(ct);

        // The guard allows one trailing semicolon; without it, the text is exactly one statement.
        await using var cmd = new NpgsqlCommand(sql.TrimEnd().TrimEnd(';'), conn, tx) { CommandTimeout = o.TimeoutSeconds + 5 };
        QueryResult result;
        var reader = await cmd.ExecuteReaderAsync(ct);
        try
        {
            // Two columns can share a name (SELECT a.x, b.x); rows are keyed by column, so later ones get a suffix.
            var columns = new List<string>();
            for (var i = 0; i < reader.FieldCount; i++)
            {
                var name = reader.GetName(i);
                for (var n = 2; columns.Contains(name); n++)
                    name = $"{reader.GetName(i)}_{n}";
                columns.Add(name);
            }
            var rows = new List<Dictionary<string, object?>>();
            var truncated = false;
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
            // Closing the reader would otherwise read every remaining row; cancel the query so PostgreSQL stops sending them.
            if (truncated)
                cmd.Cancel();
        }
        finally
        {
            try
            {
                await reader.DisposeAsync();
            }
            catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.QueryCanceled)
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
