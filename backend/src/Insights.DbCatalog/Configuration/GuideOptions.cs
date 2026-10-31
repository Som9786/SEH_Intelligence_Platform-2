namespace Insights.DbCatalog.Configuration;

/// A database's page name and suggested questions, and extra words for its tables and columns: the "Guide" section of the
/// db-catalog.json in its catalog folder. The synonyms are loaded into Neo4j with the catalog; saving the file reloads it.
public sealed class GuideOptions
{
    public const string SectionName = "Guide";
    public const string FileName = "db-catalog.json";

    public string Name { get; set; } = "";
    public List<string> Suggestions { get; set; } = [];
    /// Table id (schema.Table) or column id (schema.Table.Column) -> words people use for it.
    public Dictionary<string, List<string>> Synonyms { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}
