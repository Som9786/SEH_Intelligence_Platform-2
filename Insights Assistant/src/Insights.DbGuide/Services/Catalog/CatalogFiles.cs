using System.Text.Json;
using Insights.DbGuide.Configuration;
using Insights.DbGuide.Models;
using Microsoft.Extensions.Options;

namespace Insights.DbGuide.Services.Catalog;

/// The catalog export as read from its folder, checked to describe one consistent database.
public sealed record CatalogExport(
    DatabaseFile Database, List<BusinessAreaEntry> Areas, List<RelationshipEntry> Relationships, List<TableFile> Tables,
    Dictionary<string, string> Documentation);

/// Reads the catalog export folder (Catalog:Path): database.json, business-areas.json, relationships.json, every
/// tables/*.json, and the Markdown page database.json lists for each table.
public sealed class CatalogFiles(IOptions<CatalogOptions> options, IHostEnvironment environment)
{
    /// The export folder, resolved against the project folder.
    public string Folder => Path.GetFullPath(Path.Combine(environment.ContentRootPath, options.Value.Path));

    public CatalogExport Read()
    {
        var folder = Folder;
        if (!Directory.Exists(folder))
            throw new CatalogException($"The catalog folder {folder} doesn't exist. Set Catalog:Path to the export's catalog folder.");

        var problems = new List<string>();
        var database = Load<DatabaseFile>(Path.Combine(folder, "database.json"), problems);
        var areas = Load<BusinessAreasFile>(Path.Combine(folder, "business-areas.json"), problems)?.BusinessAreas ?? [];
        var relationships = Load<RelationshipsFile>(Path.Combine(folder, "relationships.json"), problems)?.Relationships ?? [];
        var tablesFolder = Path.Combine(folder, "tables");
        var tables = Directory.Exists(tablesFolder)
            ? Directory.GetFiles(tablesFolder, "*.json").Order(StringComparer.OrdinalIgnoreCase)
                .Select(f => Load<TableFile>(f, problems)).OfType<TableFile>().ToList()
            : [];
        if (tables.Count == 0)
            problems.Add($"{tablesFolder} has no table files");

        // Every reference must name a table, and a column of it, that the export describes.
        foreach (var g in tables.GroupBy(t => t.Id, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1))
            problems.Add($"Table {g.Key} is described {g.Count()} times");
        var byId = tables.DistinctBy(t => t.Id, StringComparer.OrdinalIgnoreCase).ToDictionary(t => t.Id, StringComparer.OrdinalIgnoreCase);
        bool HasColumn(string table, string column) =>
            byId.TryGetValue(table, out var t) && t.Columns.Any(c => string.Equals(c.Name, column, StringComparison.OrdinalIgnoreCase));
        foreach (var a in areas)
            foreach (var t in a.Tables.Where(t => !byId.ContainsKey(t)))
                problems.Add($"Business area {a.Name} lists table {t}, which has no table file");
        foreach (var r in relationships)
            foreach (var end in new[] { r.From, r.To })
            {
                if (!byId.ContainsKey(end.Table))
                    problems.Add($"Relationship {r.Name ?? $"{r.From.Table} -> {r.To.Table}"} connects {end.Table}, which has no table file");
                else
                    foreach (var c in end.Columns.Where(c => !HasColumn(end.Table, c)))
                        problems.Add($"Relationship {r.Name ?? $"{r.From.Table} -> {r.To.Table}"} uses {end.Table}.{c}, which isn't one of its columns");
            }
        foreach (var t in tables)
            foreach (var c in t.Columns.Where(c => c.ForeignKey is { } fk && !HasColumn(fk.Table, fk.Column)))
                problems.Add($"Column {t.Id}.{c.Name} references {c.ForeignKey!.Table}.{c.ForeignKey.Column}, which the catalog doesn't describe");
        if (problems.Count > 0)
            throw new CatalogException(string.Join("; ", problems) + ".");

        // Each table's Markdown page, when the export wrote one. Optional: the structured files hold the facts.
        var documentation = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var d in database!.Documents ?? [])
            if (d.Table is { } table && byId.ContainsKey(table) && File.Exists(Path.Combine(folder, d.Path)))
                documentation[table] = File.ReadAllText(Path.Combine(folder, d.Path));

        return new(database, areas, relationships, tables, documentation);
    }

    static T? Load<T>(string path, List<string> problems) where T : class
    {
        if (!File.Exists(path))
        {
            problems.Add($"{path} is missing");
            return null;
        }
        try
        {
            using var stream = File.OpenRead(path);
            var value = JsonSerializer.Deserialize<T>(stream, JsonSerializerOptions.Web);
            if (value is null)
                problems.Add($"{Path.GetFileName(path)} is empty");
            return value;
        }
        catch (JsonException e)
        {
            problems.Add($"{Path.GetFileName(path)} isn't valid: {e.Message}");
            return null;
        }
    }
}
