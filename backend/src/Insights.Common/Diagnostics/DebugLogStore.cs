using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Insights.Common.Diagnostics;

/// One log entry. Source is the class that wrote it, e.g. "PosBasketSyncService".
public sealed record DebugLogEntry(long Id, DateTimeOffset Time, string Level, string Source, string Message, string? Error);

/// Response of GET /logs. LastId lets a caller notice a restart (ids start again at 1). LogFile is today's log file, if any.
public sealed record DebugLogResponse(bool Enabled, long LastId, IReadOnlyList<DebugLogEntry> Entries, string? LogFile = null);

/// The most recent log entries from this service, kept in memory for GET /logs.
public sealed class DebugLogStore(IOptionsMonitor<DebugLogOptions> options)
{
    readonly Lock gate = new();
    readonly Queue<DebugLogEntry> entries = new();
    long lastId;

    public void Add(LogLevel level, string category, string message, Exception? exception)
    {
        lock (gate)
        {
            entries.Enqueue(new(++lastId, DateTimeOffset.UtcNow, level.ToString(), category[(category.LastIndexOf('.') + 1)..],
                message, exception is null ? null : Describe(exception)));
            while (entries.Count > Math.Max(1, options.CurrentValue.MaxEntries))
                entries.Dequeue();
        }
    }

    /// The exception's message plus its root cause, which wrappers such as the Neo4j driver's retry error hide.
    static string Describe(Exception exception)
    {
        var root = exception;
        while (root.InnerException is { } inner)
            root = inner;
        return root == exception || root.Message == exception.Message ? exception.Message : $"{exception.Message} Cause: {root.Message}";
    }

    /// Entries newer than `after` (0 for all).
    public DebugLogResponse Read(long after)
    {
        lock (gate)
            return new(options.CurrentValue.Enabled, lastId, entries.Where(e => e.Id > after).ToList());
    }

    public void Clear()
    {
        lock (gate)
            entries.Clear();
    }
}
