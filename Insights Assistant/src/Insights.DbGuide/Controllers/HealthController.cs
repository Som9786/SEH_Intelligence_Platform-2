using Insights.DbGuide.Models;
using Insights.DbGuide.Services.AiHub;
using Insights.DbGuide.Services.Catalog;
using Microsoft.AspNetCore.Mvc;

namespace Insights.DbGuide.Controllers;

/// Whether the catalog is loaded in Neo4j and the AI Hub answers, for the page's status pills.
[ApiController]
public sealed class HealthController(CatalogLoader loader, AiHubClient aiHub) : ControllerBase
{
    [HttpGet("health")]
    public async Task<HealthResponse> Get(CancellationToken ct)
    {
        var last = loader.LastLoad;
        var catalog = last is null ? new ComponentHealth(false, "Not loaded yet")
            : last.Succeeded ? new ComponentHealth(true, $"Loaded {last.At:u}: " + string.Join(", ", last.Counts.Select(c => $"{c.Value} {c.Key}")))
            : new ComponentHealth(false, last.Error ?? "The last load failed");
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
