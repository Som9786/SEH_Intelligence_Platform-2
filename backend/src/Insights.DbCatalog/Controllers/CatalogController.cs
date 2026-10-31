using Insights.DbCatalog.Models;
using Insights.DbCatalog.Services.Catalog;
using Microsoft.AspNetCore.Mvc;

namespace Insights.DbCatalog.Controllers;

/// Each route is under databases/{database}/ for one database of the catalog. The older routes without it answer for the
/// default database (Catalog:DefaultDatabase). An unknown database is a 404.
[ApiController]
public sealed class CatalogController(CatalogReader reader, CatalogLoader loader, CatalogFiles files) : ControllerBase
{
    /// The databases the catalog describes, for the page's database picker.
    [HttpGet("databases")]
    public List<CatalogDatabase> Databases()
    {
        var databases = files.Databases();
        var fallback = databases.Count > 0 ? files.DefaultDatabase() : null;
        return databases.Select(d => new CatalogDatabase(d, Title(d), string.Equals(d, fallback, StringComparison.OrdinalIgnoreCase),
            loader.LastLoad(d))).ToList();
    }

    /// The whole catalog at a glance: the database, business areas, every table in brief, and every join.
    [HttpGet("catalog")]
    [HttpGet("databases/{database}/catalog")]
    [ProducesResponseType<CatalogOverview>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<CatalogOverview> Overview(string? database, CancellationToken ct) => reader.GetOverviewAsync(files.Resolve(database), ct);

    /// One table in full: columns, joins, indexes, constraints, triggers, business rules and its documentation page.
    [HttpGet("catalog/tables/{id}")]
    [HttpGet("databases/{database}/catalog/tables/{id}")]
    [ProducesResponseType<TableDetail>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TableDetail>> Table(string? database, string id, CancellationToken ct) =>
        await reader.GetTableAsync(files.Resolve(database), id, ct) is { } table ? table
            : Problem($"The catalog has no table {id}. Use the schema-qualified name, such as sales.Orders.", statusCode: StatusCodes.Status404NotFound);

    /// The part of the catalog a question is about: what the AI is given to answer it.
    [HttpPost("context")]
    [ProducesResponseType<GuideContext>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<GuideContext>> Context(AskRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return Problem("'question' is required.", statusCode: StatusCodes.Status400BadRequest);
        return await reader.GetContextAsync(files.Resolve(request.Database), request.Question,
            request.History?.Select(h => h.Question).ToList() ?? [], ct);
    }

    /// A database's last catalog load: when, what it loaded, and its error if it failed. 404 before the first load.
    [HttpGet("catalog/status")]
    [HttpGet("databases/{database}/catalog/status")]
    [ProducesResponseType<CatalogLoadStatus>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<CatalogLoadStatus> Status(string? database) =>
        loader.LastLoad(files.Resolve(database)) is { } status ? status
            : Problem("The catalog hasn't been loaded yet.", statusCode: StatusCodes.Status404NotFound);

    /// Loads a database's export folder and db-catalog.json into Neo4j again. Changing a file does this by itself.
    [HttpPost("catalog/reload")]
    [HttpPost("databases/{database}/catalog/reload")]
    [ProducesResponseType<CatalogLoadStatus>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status500InternalServerError)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public Task<CatalogLoadStatus> Reload(string? database, CancellationToken ct) => loader.LoadAsync(files.Resolve(database), ct);

    /// A database's page name and suggested questions.
    [HttpGet("guide")]
    [HttpGet("databases/{database}/guide")]
    [ProducesResponseType<GuideInfo>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public GuideInfo Guide(string? database)
    {
        var guide = files.ReadGuide(files.Resolve(database));
        return new(guide.Name, guide.Suggestions);
    }

    /// The name db-catalog.json gives the database's page, or the folder name when the file can't be read.
    string Title(string database)
    {
        try
        {
            return files.ReadGuide(database).Name;
        }
        catch (CatalogException)
        {
            return database;
        }
    }
}
