using Insights.DbCatalog.Configuration;
using Insights.DbCatalog.Models;
using Insights.DbCatalog.Services.Catalog;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Insights.DbCatalog.Controllers;

[ApiController]
public sealed class CatalogController(CatalogReader reader, CatalogLoader loader, IOptionsMonitor<GuideOptions> guide) : ControllerBase
{
    /// The whole catalog at a glance: the database, business areas, every table in brief, and every join.
    [HttpGet("catalog")]
    public Task<CatalogOverview> Overview(CancellationToken ct) => reader.GetOverviewAsync(ct);

    /// One table in full: columns, joins, indexes, constraints, triggers, business rules and its documentation page.
    [HttpGet("catalog/tables/{id}")]
    [ProducesResponseType<TableDetail>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TableDetail>> Table(string id, CancellationToken ct) =>
        await reader.GetTableAsync(id, ct) is { } table ? table
            : Problem($"The catalog has no table {id}. Use the schema-qualified name, such as sales.Orders.", statusCode: StatusCodes.Status404NotFound);

    /// The part of the catalog a question is about: what the AI is given to answer it.
    [HttpPost("context")]
    [ProducesResponseType<GuideContext>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<GuideContext>> Context(AskRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return Problem("'question' is required.", statusCode: StatusCodes.Status400BadRequest);
        return await reader.GetContextAsync(request.Question, request.History?.Select(h => h.Question).ToList() ?? [], ct);
    }

    /// The last catalog load: when, what it loaded, and its error if it failed. 404 before the first load.
    [HttpGet("catalog/status")]
    [ProducesResponseType<CatalogLoadStatus>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<CatalogLoadStatus> Status() =>
        loader.LastLoad is { } status ? status : Problem("The catalog hasn't been loaded yet.", statusCode: StatusCodes.Status404NotFound);

    /// Loads the export folder and db-catalog.json into Neo4j again. Changing a file does this by itself.
    [HttpPost("catalog/reload")]
    [ProducesResponseType<CatalogLoadStatus>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status500InternalServerError)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public Task<CatalogLoadStatus> Reload(CancellationToken ct) => loader.LoadAsync(ct);

    /// The page's name and suggested questions.
    [HttpGet("guide")]
    public GuideInfo Guide() => new(guide.CurrentValue.Name, guide.CurrentValue.Suggestions);
}
