namespace Insights.DbGuide.Configuration;

/// Where the database catalog export lives: a folder with database.json, business-areas.json, relationships.json,
/// tables/*.json and documentation/*.md, as the metadata export writes them.
public sealed class CatalogOptions
{
    public const string SectionName = "Catalog";

    /// Relative to the project folder, or absolute.
    public string Path { get; set; } = "catalog";
}
