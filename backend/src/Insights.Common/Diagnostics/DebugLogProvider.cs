using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Insights.Common.Diagnostics;

/// Copies log entries into the DebugLogStore: this service's own entries (categories starting with its application name)
/// at the levels the AddDebugLog filter lets through, and errors from anywhere, such as ASP.NET's unhandled-exception log.
public sealed class DebugLogProvider(DebugLogStore store, IHostEnvironment env) : ILoggerProvider
{
    readonly string categoryPrefix = env.ApplicationName;

    public ILogger CreateLogger(string categoryName) =>
        new StoreLogger(categoryName, store, categoryName.StartsWith(categoryPrefix, StringComparison.Ordinal) ? LogLevel.Information : LogLevel.Error);

    public void Dispose()
    {
    }

    sealed class StoreLogger(string category, DebugLogStore store, LogLevel minLevel) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= minLevel && logLevel != LogLevel.None;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (IsEnabled(logLevel))
                store.Add(logLevel, category, formatter(state, exception), exception);
        }
    }
}
