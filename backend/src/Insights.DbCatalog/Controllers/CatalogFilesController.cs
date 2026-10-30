using System.Text.Json;
using Insights.DbCatalog.Services.Catalog;
using Microsoft.AspNetCore.Mvc;

namespace Insights.DbCatalog.Controllers;

/// The catalog export's files as the SEH Intelligence Platform UI reads them, so the UI doesn't publish the files itself.
/// Only what database.json publishes is served: itself, relationships.json, business-areas.json, each document and each
/// table's details file. Sample data (*.data.json) and anything else in the folder are never served.
[ApiController]
public sealed class CatalogFilesController(CatalogFiles files) : ControllerBase
{
    static readonly Dictionary<string, string> ContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".json"] = "application/json; charset=utf-8",
        [".md"] = "text/markdown; charset=utf-8",
    };

    /// One catalog file, by its path inside the export folder, such as tables/sales.orders.json.
    [HttpGet("catalog/files/{**path}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public IActionResult File(string path)
    {
        var folder = files.Folder;
        var relative = path.Replace('\\', '/');
        var published = Published(folder);
        if (published is null || !published.Contains(relative) || relative.EndsWith(".data.json", StringComparison.OrdinalIgnoreCase))
            return NotFoundProblem(path);

        var full = Path.GetFullPath(Path.Combine(folder, relative));
        if (!full.StartsWith(folder + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !System.IO.File.Exists(full))
            return NotFoundProblem(path);

        Response.Headers.CacheControl = "no-cache";
        return PhysicalFile(full, ContentTypes.GetValueOrDefault(Path.GetExtension(full), "application/octet-stream"));
    }

    ObjectResult NotFoundProblem(string path) =>
        Problem($"The catalog has no file {path}.", statusCode: StatusCodes.Status404NotFound);

    /// The paths database.json publishes, or null when it can't be read.
    static HashSet<string>? Published(string folder)
    {
        try
        {
            using var stream = System.IO.File.OpenRead(Path.Combine(folder, "database.json"));
            using var json = JsonDocument.Parse(stream);
            var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "database.json", "relationships.json", "business-areas.json" };
            AddPaths(json.RootElement, "documents", "path", paths);
            AddPaths(json.RootElement, "tables", "detailsPath", paths);
            return paths;
        }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    static void AddPaths(JsonElement root, string list, string property, HashSet<string> paths)
    {
        if (!root.TryGetProperty(list, out var items) || items.ValueKind != JsonValueKind.Array)
            return;
        foreach (var item in items.EnumerateArray())
            if (item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) && value.GetString() is { Length: > 0 } p)
                paths.Add(p.Replace('\\', '/'));
    }
}
