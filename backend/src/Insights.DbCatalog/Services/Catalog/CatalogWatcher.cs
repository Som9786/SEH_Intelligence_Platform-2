namespace Insights.DbCatalog.Services.Catalog;

/// Keeps the Neo4j catalog in step with the catalog folder: loads every database at startup, then a database again whenever
/// a file in its folder changes (a new export copied over it, or a synonym added to its db-catalog.json), so questions see
/// it without a restart. A new database folder is loaded, and a deleted one removed from Neo4j.
public sealed class CatalogWatcher(
    CatalogLoader loader, CatalogFiles files, IHostApplicationLifetime lifetime, ILogger<CatalogWatcher> logger)
    : IHostedService, IDisposable
{
    // Copying an export writes many files, so wait for the changes to settle before reloading once.
    static readonly TimeSpan SettleTime = TimeSpan.FromSeconds(2);

    readonly HashSet<string> changed = new(StringComparer.OrdinalIgnoreCase);
    Timer? reloadTimer;
    FileSystemWatcher? folderWatcher;
    CancellationTokenRegistration started;

    public Task StartAsync(CancellationToken ct)
    {
        reloadTimer = new Timer(_ => _ = LoadChangedAsync(), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        if (Directory.Exists(files.Root))
        {
            folderWatcher = new FileSystemWatcher(files.Root) { IncludeSubdirectories = true, EnableRaisingEvents = true };
            folderWatcher.Changed += (_, e) => Changed(e.FullPath);
            folderWatcher.Created += (_, e) => Changed(e.FullPath);
            folderWatcher.Deleted += (_, e) => Changed(e.FullPath);
            folderWatcher.Renamed += (_, e) =>
            {
                Changed(e.OldFullPath);
                Changed(e.FullPath);
            };
        }
        else
            logger.LogWarning("Catalog: the catalog folder {Folder} doesn't exist. Set Catalog:Path to it.", files.Root);
        // In the background, so a slow or stopped Neo4j doesn't hold up startup; the first question loads it otherwise.
        started = lifetime.ApplicationStarted.Register(() => _ = LoadAllAsync());
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;

    public void Dispose()
    {
        started.Dispose();
        folderWatcher?.Dispose();
        reloadTimer?.Dispose();
    }

    /// Notes which database a changed path belongs to: the first folder under the catalog folder.
    void Changed(string path)
    {
        var relative = Path.GetRelativePath(files.Root, path);
        var database = relative.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)[0];
        if (database is "" or "." or ".." || relative.StartsWith("..", StringComparison.Ordinal))
            return;
        lock (changed)
            changed.Add(database);
        reloadTimer?.Change(SettleTime, Timeout.InfiniteTimeSpan);
    }

    async Task LoadAllAsync()
    {
        logger.LogInformation("Catalog: loading every database (startup) from {Folder}", files.Root);
        try
        {
            await loader.LoadAllAsync(lifetime.ApplicationStopping);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            logger.LogWarning("Catalog: not loaded (startup); Neo4j keeps the previous catalog. {Message}", e.Message);
        }
    }

    async Task LoadChangedAsync()
    {
        List<string> databases;
        lock (changed)
        {
            databases = [.. changed];
            changed.Clear();
        }
        var existing = files.Databases();
        foreach (var database in databases)
        {
            var name = existing.FirstOrDefault(d => string.Equals(d, database, StringComparison.OrdinalIgnoreCase));
            try
            {
                if (name is null)
                {
                    // A folder deleted or renamed away, or a loose file in the catalog folder; only a loaded one is removed.
                    if (loader.LastLoad(database) is not null)
                        await loader.RemoveAsync(database, lifetime.ApplicationStopping);
                    continue;
                }
                logger.LogInformation("Catalog: loading {Database} (a file changed)", name);
                await loader.LoadAsync(name, lifetime.ApplicationStopping);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                // CatalogLoader has logged it. Questions keep the catalog Neo4j already holds.
                logger.LogWarning("Catalog: {Database} not loaded (a file changed); Neo4j keeps the previous catalog. {Message}",
                    database, e.Message);
            }
        }
    }
}
