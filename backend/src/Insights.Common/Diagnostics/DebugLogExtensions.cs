using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Insights.Common.Diagnostics;

public static class DebugLogExtensions
{
    /// Turns this service's step-by-step Information logs on or off with DebugLog:Enabled, and keeps recent entries for GET /logs.
    public static WebApplicationBuilder AddDebugLog(this WebApplicationBuilder builder)
    {
        var section = builder.Configuration.GetSection(DebugLogOptions.SectionName);
        builder.Services.Configure<DebugLogOptions>(section);

        // Applies to every logger of this service (console and /logs). Evaluated on each log call, so editing
        // DebugLog:Enabled in appsettings.json takes effect without a restart. Warnings and errors always pass.
        // The app's own name (Insights.Analytics, Insights.AiHub), which starts its log categories.
        var categoryPrefix = builder.Environment.ApplicationName;
        builder.Logging.AddFilter(categoryPrefix, level => level >= LogLevel.Warning || section.GetValue<bool>(nameof(DebugLogOptions.Enabled)));

        builder.Services.AddSingleton<DebugLogStore>();
        builder.Services.AddSingleton<ILoggerProvider, DebugLogProvider>();
        // Daily log files (DebugLog:WriteToFile). One instance, so /logs can report the current file's path.
        builder.Services.AddSingleton<FileLogProvider>();
        builder.Services.AddSingleton<ILoggerProvider>(sp => sp.GetRequiredService<FileLogProvider>());
        return builder;
    }
}
