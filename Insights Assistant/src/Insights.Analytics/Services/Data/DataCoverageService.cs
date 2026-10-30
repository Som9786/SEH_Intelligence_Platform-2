using Insights.Analytics.Configuration;
using Insights.Analytics.Models;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Insights.Analytics.Services.Data;

/// Whether PostgreSQL answers, and the first and last business date it holds (from the knowledge model's first table with a
/// DateColumn), so the AI can read "yesterday" or "last week" against the data. Read at most every 10 minutes,
/// since new days arrive in PostgreSQL without telling anyone; a failure is retried after a minute.
public sealed class DataCoverageService(PosBasketDatabase database, IOptionsMonitor<KnowledgeModelOptions> knowledgeModel, ILogger<DataCoverageService> logger)
{
    static readonly TimeSpan FreshFor = TimeSpan.FromMinutes(10);
    static readonly TimeSpan RetryAfter = TimeSpan.FromMinutes(1);

    sealed record Entry(DataStatus Status, DateTimeOffset ReadAt);

    readonly SemaphoreSlim gate = new(1, 1);
    Entry? cached;

    /// Reads it again on next use, e.g. after the knowledge model's tables changed.
    public void Invalidate() => Volatile.Write(ref cached, null);

    public async Task<DataStatus> GetAsync(CancellationToken ct)
    {
        if (Fresh() is { } status)
            return status;
        await gate.WaitAsync(ct);
        try
        {
            // Another caller may have read it while this one waited.
            if (Fresh() is { } other)
                return other;
            status = await ReadAsync(ct);
            Volatile.Write(ref cached, new(status, DateTimeOffset.UtcNow));
            return status;
        }
        finally
        {
            gate.Release();
        }
    }

    DataStatus? Fresh() =>
        Volatile.Read(ref cached) is { } e && DateTimeOffset.UtcNow - e.ReadAt < (e.Status.Error is null ? FreshFor : RetryAfter) ? e.Status : null;

    async Task<DataStatus> ReadAsync(CancellationToken ct)
    {
        var table = knowledgeModel.CurrentValue.Tables.FirstOrDefault(t => !string.IsNullOrWhiteSpace(t.DateColumn));
        var sql = table is null
            ? "SELECT NULL::text, NULL::text"
            : $"SELECT min({Quote(table.DateColumn!)})::text, max({Quote(table.DateColumn!)})::text FROM {QuoteQualified(table.Name)}";
        try
        {
            await using var conn = await database.OpenAsync(ct);
            await using var cmd = new NpgsqlCommand(sql, conn);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            await reader.ReadAsync(ct);
            var coverage = reader.IsDBNull(0) ? null : new DataCoverage(reader.GetString(0), reader.GetString(1));
            logger.LogInformation("Data: PostgreSQL {Database} answers; {Coverage}", database.Name,
                coverage is null ? "no business dates found" : $"business dates {coverage.From} to {coverage.To}");
            return new(coverage, null);
        }
        catch (Exception e) when (e is NpgsqlException or TimeoutException)
        {
            logger.LogWarning("Data: could not read PostgreSQL {Database}: {Message}", database.Name, e.Message);
            return new(null, e.Message);
        }
    }

    static string Quote(string name) => "\"" + name.Replace("\"", "\"\"") + "\"";

    static string QuoteQualified(string name) => string.Join('.', name.Split('.').Select(Quote));
}

/// PostgreSQL's state for questions: the dates it covers, or the error when it couldn't be read.
public sealed record DataStatus(DataCoverage? Coverage, string? Error);
