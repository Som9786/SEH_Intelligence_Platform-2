namespace Insights.Common.Diagnostics;

/// Step-by-step Information logs for following and debugging what the service does.
/// Read on every log call, so changing appsettings.json takes effect without a restart.
public sealed class DebugLogOptions
{
    public const string SectionName = "DebugLog";

    /// When false, only warnings and errors from this service are logged and kept for /logs.
    public bool Enabled { get; set; }
    /// Entries kept in memory for GET /logs; older ones are dropped.
    public int MaxEntries { get; set; } = 1000;
    /// Also write everything the console shows to one file per day: {FileDirectory}/{service}-{yyyy-MM-dd}.log.
    public bool WriteToFile { get; set; } = true;
    /// Relative to the project folder unless absolute. Read at startup.
    public string FileDirectory { get; set; } = "logs";
    /// Log files older than this many days are deleted.
    public int RetainedFileDays { get; set; } = 7;
}
