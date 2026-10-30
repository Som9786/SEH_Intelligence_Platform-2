using Insights.Analytics.Models;
using Insights.Analytics.Services.Data;
using Insights.Analytics.Services.KnowledgeModel;
using Microsoft.AspNetCore.Mvc;

namespace Insights.Analytics.Controllers;

/// Whether the two databases answer: Neo4j with the knowledge model, and PostgreSQL or SQL Server (PosBasket:Provider) with the data. For the Q&A page's status pills.
[ApiController]
[Route("health")]
public sealed class HealthController(KnowledgeModelLoader loader, DataCoverageService data, PosBasketDatabase database) : ControllerBase
{
    [HttpGet]
    public async Task<HealthResponse> Get(CancellationToken ct)
    {
        var last = loader.LastLoad;
        var knowledgeModel = last is null ? new ComponentHealth(false, "Not loaded yet")
            : last.Succeeded ? new ComponentHealth(true, $"Loaded {last.At:u}: " + string.Join(", ", last.Counts.Select(c => $"{c.Value} {c.Key}")))
            : new ComponentHealth(false, last.Error ?? "The last load failed");
        var status = await data.GetAsync(ct);
        var dataHealth = status.Error is { } error ? new ComponentHealth(false, $"{database.Name}: {error}")
            : new ComponentHealth(true, status.Coverage is { } c ? $"{database.Name}, business dates {c.From} to {c.To}" : database.Name);
        return new(knowledgeModel, dataHealth, status.Coverage);
    }
}
