using Insights.DbCatalog.Configuration;
using Microsoft.Extensions.Options;

namespace Insights.DbCatalog.Services.Catalog;

/// Keeps the Neo4j catalog in step with the export folder and db-catalog.json: loads it at startup, then again whenever a
/// file changes (a new export copied over the folder, or a synonym added), so questions see it without a restart.
public sealed class CatalogWatcher(
    CatalogLoader loader, CatalogFiles files, IOptionsMonitor<GuideOptions> guide, IHostApplicationLifetime lifetime,
    ILogger<CatalogWatcher> logger) : IHostedService, IDisposable
{
    // Copying an export writes many files, so wait for the changes to settle before reloading once.
    static readonly TimeSpan SettleTime = TimeSpan.FromSeconds(2);

    Timer? reloadTimer;
    FileSystemWatcher? folderWatcher;
    IDisposable? guideSubscription;
    CancellationTokenRegistration started;

    public Task StartAsync(CancellationToken ct)
    {
        reloadTimer = new Timer(_ => _ = LoadAsync("a file changed"), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        void Changed() => reloadTimer.Change(SettleTime, Timeout.InfiniteTimeSpan);
        guideSubscription = guide.OnChange(_ => Changed());
        if (Directory.Exists(files.Folder))
        {
            folderWatcher = new FileSystemWatcher(files.Folder) { IncludeSubdirectories = true, EnableRaisingEvents = true };
            folderWatcher.Changed += (_, _) => Changed();
            folderWatcher.Created += (_, _) => Changed();
            folderWatcher.Deleted += (_, _) => Changed();
            folderWatcher.Renamed += (_, _) => Changed();
        }
        // In the background, so a slow or stopped Neo4j doesn't hold up startup; the first question loads it otherwise.
        started = lifetime.ApplicationStarted.Register(() => _ = LoadAsync("startup"));
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;

    public void Dispose()
    {
        started.Dispose();
        guideSubscription?.Dispose();
        folderWatcher?.Dispose();
        reloadTimer?.Dispose();
    }

    async Task LoadAsync(string why)
    {
        logger.LogInformation("Catalog: loading ({Why}) from {Folder}", why, files.Folder);
        try
        {
            await loader.LoadAsync(lifetime.ApplicationStopping);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            // CatalogLoader has logged it. Questions keep the catalog Neo4j already holds.
            logger.LogWarning("Catalog: not loaded ({Why}); Neo4j keeps the previous catalog. {Message}", why, e.Message);
        }
    }
}
