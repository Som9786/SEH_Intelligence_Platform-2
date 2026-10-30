namespace Insights.DbCatalog.Configuration;

/// The page's name and suggested questions, and extra words for tables and columns (db-catalog.json). The synonyms are
/// loaded into Neo4j with the catalog; read through IOptionsMonitor so edits apply without a restart.
public sealed class GuideOptions
{
    public const string SectionName = "Guide";
    public const string FileName = "db-catalog.json";

    public string Name { get; set; } = "";
    public List<string> Suggestions { get; set; } = [];
    /// Table id (schema.Table) or column id (schema.Table.Column) -> words people use for it.
    public Dictionary<string, List<string>> Synonyms { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}
