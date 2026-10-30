using Insights.Analytics.Configuration;
using Microsoft.Extensions.Options;

namespace Insights.Analytics.Services.KnowledgeModel;

/// Keeps the Neo4j knowledge model in step with knowledge-model.json, business-rules.json and query-examples.json: loads it at
/// startup, then again whenever one of the files changes, so edits reach the AI on the next question without a restart.
public sealed class KnowledgeModelWatcher(
    KnowledgeModelLoader loader, IOptionsMonitor<KnowledgeModelOptions> knowledgeModel, IOptionsMonitor<DatasetOptions> dataset,
    IHostApplicationLifetime lifetime, ILogger<KnowledgeModelWatcher> logger) : IHostedService, IDisposable
{
    // Editors often save a file in several writes, so wait for the changes to settle before reloading once.
    static readonly TimeSpan SettleTime = TimeSpan.FromSeconds(1);

    Timer? reloadTimer;
    IDisposable? knowledgeModelSubscription, datasetSubscription;
    CancellationTokenRegistration started;

    public Task StartAsync(CancellationToken ct)
    {
        reloadTimer = new Timer(_ => _ = LoadAsync("a file changed"), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        knowledgeModelSubscription = knowledgeModel.OnChange(_ => reloadTimer.Change(SettleTime, Timeout.InfiniteTimeSpan));
        datasetSubscription = dataset.OnChange(_ => reloadTimer.Change(SettleTime, Timeout.InfiniteTimeSpan));
        // In the background, so a slow or stopped Neo4j doesn't hold up startup; the first question loads it otherwise.
        started = lifetime.ApplicationStarted.Register(() => _ = LoadAsync("startup"));
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;

    public void Dispose()
    {
        started.Dispose();
        knowledgeModelSubscription?.Dispose();
        datasetSubscription?.Dispose();
        reloadTimer?.Dispose();
    }

    async Task LoadAsync(string why)
    {
        var d = dataset.CurrentValue;
        logger.LogInformation("Knowledge model: loading ({Why}): {Rules} business rules, {Examples} example queries",
            why, d.BusinessRules.Count, d.Examples.Count);
        if (d.BusinessRules.Count == 0)
            logger.LogWarning("Knowledge model: {File} has no business rules (Dataset:BusinessRules), so the AI writes queries without them",
                DatasetOptions.RulesFileName);
        try
        {
            await loader.LoadAsync(lifetime.ApplicationStopping);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            // KnowledgeModelLoader has logged it. Questions keep the knowledge model Neo4j already holds.
            logger.LogWarning("Knowledge model: not loaded ({Why}); Neo4j keeps the previous knowledge model. {Message}", why, e.Message);
        }
    }
}
