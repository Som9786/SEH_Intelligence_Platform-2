using System.Text.Json;
using Insights.DbCatalog.Configuration;
using Insights.DbCatalog.Models;
using Microsoft.Extensions.Options;

namespace Insights.DbCatalog.Services.Catalog;

/// The catalog export as read from its folder, checked to describe one consistent database.
public sealed record CatalogExport(
    DatabaseFile Database, List<BusinessAreaEntry> Areas, List<RelationshipEntry> Relationships, List<TableFile> Tables,
    Dictionary<string, string> Documentation);

/// Reads the catalog folder (Catalog:Path), which holds one export folder per database. In each: database.json,
/// business-areas.json, relationships.json, every tables/*.json, the Markdown page database.json lists for each table, and
/// db-catalog.json (the page's name, suggested questions and synonyms).
public sealed class CatalogFiles(IOptions<CatalogOptions> options, IHostEnvironment environment)
{
    static readonly JsonSerializerOptions GuideJson = new(JsonSerializerOptions.Web)
    {
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    /// The catalog folder, resolved against the project folder.
    public string Root => Path.GetFullPath(Path.Combine(environment.ContentRootPath, options.Value.Path));

    /// The databases, by folder name: every subfolder with a database.json.
    public List<string> Databases() =>
        Directory.Exists(Root)
            ? Directory.GetDirectories(Root).Where(d => File.Exists(Path.Combine(d, "database.json")))
                .Select(d => Path.GetFileName(d)).Order(StringComparer.OrdinalIgnoreCase).ToList()
            : [];

    /// The database used when a request names none: Catalog:DefaultDatabase, or the first by name.
    public string DefaultDatabase()
    {
        var databases = Databases();
        if (databases.Count == 0)
            throw new CatalogException($"The catalog folder {Root} has no database folders. Put each database's export in a " +
                "folder of its own under Catalog:Path, named after the database.");
        var configured = options.Value.DefaultDatabase;
        return string.IsNullOrWhiteSpace(configured) ? databases[0]
            : databases.FirstOrDefault(d => string.Equals(d, configured, StringComparison.OrdinalIgnoreCase))
              ?? throw new CatalogException($"Catalog:DefaultDatabase is {configured}, which has no folder in {Root}.");
    }

    /// The database a request names, as its folder is spelled, or the default when it names none.
    public string Resolve(string? database)
    {
        if (string.IsNullOrWhiteSpace(database))
            return DefaultDatabase();
        var databases = Databases();
        return databases.FirstOrDefault(d => string.Equals(d, database, StringComparison.OrdinalIgnoreCase))
            ?? throw new UnknownDatabaseException($"The catalog has no database {database}. " +
                (databases.Count > 0 ? $"It has {string.Join(", ", databases)}." : "It has none."));
    }

    /// A database's export folder. The name must be one of Databases().
    public string Folder(string database) => Path.Combine(Root, database);

    /// A database's db-catalog.json; without one, the page is named after the database and has no suggestions or synonyms.
    public GuideOptions ReadGuide(string database)
    {
        var path = Path.Combine(Folder(database), GuideOptions.FileName);
        if (!File.Exists(path))
            return new() { Name = database };
        try
        {
            using var json = JsonDocument.Parse(File.ReadAllText(path), new() { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
            var guide = json.RootElement.TryGetProperty(GuideOptions.SectionName, out var section)
                ? section.Deserialize<GuideOptions>(GuideJson) ?? new() : new();
            if (string.IsNullOrWhiteSpace(guide.Name))
                guide.Name = database;
            // Deserializing replaces the dictionary, and with it the case-insensitive keys.
            var synonyms = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
            foreach (var (key, words) in guide.Synonyms)
                synonyms[key] = [.. synonyms.GetValueOrDefault(key) ?? [], .. words ?? []];
            guide.Synonyms = synonyms;
            return guide;
        }
        catch (Exception e) when (e is JsonException or IOException)
        {
            throw new CatalogException($"{database}/{GuideOptions.FileName} isn't valid: {e.Message}");
        }
    }

    public CatalogExport Read(string database)
    {
        var folder = Folder(database);
        if (!Directory.Exists(folder))
            throw new CatalogException($"The catalog folder {folder} doesn't exist.");

        var problems = new List<string>();
        var databaseFile = Load<DatabaseFile>(Path.Combine(folder, "database.json"), problems);
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
        foreach (var d in databaseFile!.Documents ?? [])
            if (d.Table is { } table && byId.ContainsKey(table) && File.Exists(Path.Combine(folder, d.Path)))
                documentation[table] = File.ReadAllText(Path.Combine(folder, d.Path));

        return new(databaseFile, areas, relationships, tables, documentation);
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
