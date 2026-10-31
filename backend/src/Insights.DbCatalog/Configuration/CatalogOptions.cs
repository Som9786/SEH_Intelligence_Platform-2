namespace Insights.DbCatalog.Configuration;

/// Where the database catalog exports live: a folder with one subfolder per database, each holding database.json,
/// business-areas.json, relationships.json, tables/*.json and documentation/*.md as the metadata export writes them, and
/// that database's db-catalog.json. The subfolder's name is the database's name in the API and the UI.
public sealed class CatalogOptions
{
    public const string SectionName = "Catalog";

    /// Relative to the project folder, or absolute.
    public string Path { get; set; } = "catalog";

    /// The database used when a request names none (the old routes, and questions from the assistant). Empty means the
    /// first database folder by name.
    public string DefaultDatabase { get; set; } = "";
}
