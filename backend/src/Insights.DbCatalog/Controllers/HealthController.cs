using Insights.Contracts;
using Insights.DbCatalog.Models;
using Insights.Common.AiHub;
using Insights.DbCatalog.Services.AiHub;
using Insights.DbCatalog.Services.Catalog;
using Microsoft.AspNetCore.Mvc;

namespace Insights.DbCatalog.Controllers;

/// Whether the catalog is loaded in Neo4j and the AI Hub answers, for the page's status pills.
[ApiController]
public sealed class HealthController(CatalogLoader loader, CatalogFiles files, AiHubClient aiHub) : ControllerBase
{
    /// The catalog is healthy when every database in the catalog folder has loaded; the detail has a line for each.
    [HttpGet("health")]
    public async Task<HealthResponse> Get(CancellationToken ct)
    {
        var databases = files.Databases();
        var states = databases.Select(d => (Database: d, Last: loader.LastLoad(d))).ToList();
        var catalog = databases.Count == 0 ? new ComponentHealth(false, $"No database folders in {files.Root}")
            : new ComponentHealth(states.All(s => s.Last?.Succeeded == true), string.Join("; ", states.Select(s => s.Last switch
            {
                null => $"{s.Database}: not loaded yet",
                { Succeeded: true } l => $"{s.Database}: loaded {l.At:u}: " + string.Join(", ", l.Counts.Select(c => $"{c.Value} {c.Key}")),
                var l => $"{s.Database}: {l.Error ?? "the last load failed"}",
            })));
        try
        {
            var ai = await aiHub.HealthAsync(ct);
            return new(catalog, new ComponentHealth(true, ai.Status), ai.Model);
        }
        catch (Exception e) when (e is HttpRequestException or AiHubException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            return new(catalog, new ComponentHealth(false, e.Message), null);
        }
    }

    /// The AI Hub's OpenAI token and cost totals, for the AI service pill.
    [HttpGet("ai/usage")]
    public async Task<ContentResult> Usage(CancellationToken ct) => Content(await aiHub.GetUsageAsync(ct), "application/json");
}
