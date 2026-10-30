using System.Text;
using System.Threading.Channels;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Insights.Common.Diagnostics;

/// Writes every log entry that passes the logging filters (the same ones the console uses) to one file per day,
/// {FileDirectory}/{service}-{yyyy-MM-dd}.log. Lines are queued and written by one background task, so logging never
/// waits for the disk; a write failure drops those lines rather than breaking the app.
public sealed class FileLogProvider : ILoggerProvider
{
    readonly IOptionsMonitor<DebugLogOptions> options;
    // insights.analytics or insights.aihub, the start of each file name.
    readonly string serviceName;
    readonly string directory;
    readonly Channel<string> queue = Channel.CreateUnbounded<string>(new() { SingleReader = true });
    readonly Task writer;
    DateOnly cleanedOn;

    public FileLogProvider(IOptionsMonitor<DebugLogOptions> options, IHostEnvironment env)
    {
        this.options = options;
        serviceName = env.ApplicationName.ToLowerInvariant();
        directory = Path.Combine(env.ContentRootPath, options.CurrentValue.FileDirectory);
        writer = Task.Run(WriteLoopAsync);
    }

    /// Today's log file, or null when WriteToFile is off.
    public string? CurrentPath => options.CurrentValue.WriteToFile ? PathFor(DateOnly.FromDateTime(DateTime.Now)) : null;

    public ILogger CreateLogger(string categoryName) => new FileLogger(categoryName, this);

    public void Dispose()
    {
        queue.Writer.TryComplete();
        writer.Wait(TimeSpan.FromSeconds(5));
    }

    string PathFor(DateOnly day) => Path.Combine(directory, $"{serviceName}-{day:yyyy-MM-dd}.log");

    void Enqueue(LogLevel level, string category, string message, Exception? exception)
    {
        if (!options.CurrentValue.WriteToFile)
            return;
        var line = new StringBuilder()
            .Append(DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss.fff zzz")).Append(' ')
            .Append(level switch
            {
                LogLevel.Trace => "TRACE",
                LogLevel.Debug => "DEBUG",
                LogLevel.Information => "INFO ",
                LogLevel.Warning => "WARN ",
                LogLevel.Error => "ERROR",
                _ => "CRIT ",
            })
            .Append(' ').Append(category).Append(": ").Append(message);
        // The file keeps the full exception with its stack trace; the Debug log card shows only the messages.
        if (exception is not null)
            line.AppendLine().Append(exception);
        queue.Writer.TryWrite(line.ToString());
    }

    async Task WriteLoopAsync()
    {
        var reader = queue.Reader;
        while (await reader.WaitToReadAsync())
        {
            var today = DateOnly.FromDateTime(DateTime.Now);
            try
            {
                Directory.CreateDirectory(directory);
                await using var file = new StreamWriter(new FileStream(PathFor(today), FileMode.Append, FileAccess.Write, FileShare.ReadWrite));
                while (reader.TryRead(out var line))
                    await file.WriteLineAsync(line);
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                // Logging must never take the service down; these lines are lost.
                while (reader.TryRead(out _))
                {
                }
            }

            if (cleanedOn != today)
            {
                cleanedOn = today;
                DeleteOldFiles(today);
            }
        }
    }

    void DeleteOldFiles(DateOnly today)
    {
        var oldest = today.AddDays(-Math.Max(1, options.CurrentValue.RetainedFileDays) + 1);
        try
        {
            foreach (var path in Directory.EnumerateFiles(directory, $"{serviceName}-*.log"))
            {
                var date = Path.GetFileNameWithoutExtension(path)[(serviceName.Length + 1)..];
                if (DateOnly.TryParseExact(date, "yyyy-MM-dd", out var day) && day < oldest)
                    File.Delete(path);
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
        }
    }

    sealed class FileLogger(string category, FileLogProvider provider) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        // Levels are decided by the logging filters (Logging:LogLevel and DebugLog:Enabled), as for the console.
        public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (IsEnabled(logLevel))
                provider.Enqueue(logLevel, category, formatter(state, exception), exception);
        }
    }
}
