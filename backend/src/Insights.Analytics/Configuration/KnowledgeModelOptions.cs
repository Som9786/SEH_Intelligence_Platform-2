namespace Insights.Analytics.Configuration;

/// What the data means and where it lives (knowledge-model.json): the tables and columns (named as in PostgreSQL), the business concepts
/// stored in them, how concepts relate, the agreed metric formulas, and the words people use for each.
/// Loaded into Neo4j at startup and whenever the file changes; read through IOptionsMonitor.
public sealed class KnowledgeModelOptions
{
    public const string SectionName = "KnowledgeModel";
    public const string FileName = "knowledge-model.json";

    public List<TableDefinition> Tables { get; set; } = [];
    public List<ConceptDefinition> Concepts { get; set; } = [];
    public List<RelationshipDefinition> Relationships { get; set; } = [];
    public List<MetricDefinition> Metrics { get; set; } = [];
}

public sealed class TableDefinition
{
    /// Schema-qualified, as it's written in SQL: public.pos_basket_line.
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    /// The business-date column, used to tell the AI which dates the data covers. Optional.
    public string? DateColumn { get; set; }
    public List<ColumnDefinition> Columns { get; set; } = [];
}

public sealed class ColumnDefinition
{
    public string Name { get; set; } = "";
    public string Type { get; set; } = "";
    public string Description { get; set; } = "";
    /// The values a code column can hold, when they're a short fixed list.
    public List<string>? Values { get; set; }
}

public sealed class ConceptDefinition
{
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Table { get; set; } = "";
    /// The column or SQL expression that identifies one of it.
    public string Key { get; set; } = "";
    public List<string> Synonyms { get; set; } = [];
    public List<AttributeDefinition> Attributes { get; set; } = [];
}

public sealed class AttributeDefinition
{
    public string Name { get; set; } = "";
    /// SQL over the concept's table, such as str_num or return_regular = 'return'.
    public string Expression { get; set; } = "";
    public string Description { get; set; } = "";
}

public sealed class RelationshipDefinition
{
    public string Name { get; set; } = "";
    public string From { get; set; } = "";
    public string To { get; set; } = "";
    /// How to join the two in SQL.
    public string Join { get; set; } = "";
}

public sealed class MetricDefinition
{
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    /// The agreed SQL formula.
    public string Expression { get; set; } = "";
    /// The concepts it measures.
    public List<string> Concepts { get; set; } = [];
    public List<string> Synonyms { get; set; } = [];
}
