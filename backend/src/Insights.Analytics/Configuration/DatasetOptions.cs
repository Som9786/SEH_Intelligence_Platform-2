namespace Insights.Analytics.Configuration;

/// The dataset's name and suggested questions (suggested-questions.json), its business rules (business-rules.json) and
/// its verified example queries (query-examples.json). Read through IOptionsMonitor, so edits to any of them apply
/// without a restart. The rules and examples are loaded into the Neo4j knowledge model with knowledge-model.json.
public sealed class DatasetOptions
{
    public const string SectionName = "Dataset";
    /// The files sit next to appsettings.json and are loaded with reloadOnChange in Program.cs.
    public const string QuestionsFileName = "suggested-questions.json";
    public const string RulesFileName = "business-rules.json";
    public const string ExamplesFileName = "query-examples.json";

    public string Name { get; set; } = "";
    /// Example questions shown on the Q&A page.
    public List<string> Suggestions { get; set; } = [];
    /// Business rules a correct query must follow. Each reaches the AI with questions about what it applies to.
    public List<BusinessRule> BusinessRules { get; set; } = [];
    /// Questions with SQL checked as correct. The AI gets the ones about the same concepts and metrics as its question.
    public List<QueryExample> Examples { get; set; } = [];
}

public sealed class BusinessRule
{
    public string Text { get; set; } = "";
    /// Names of the knowledge model's concepts and metrics the rule is about. Empty: it goes with every question.
    public List<string> AppliesTo { get; set; } = [];
}

public sealed class QueryExample
{
    public string Question { get; set; } = "";
    public string Sql { get; set; } = "";
    /// "SQL Server" for a query written for SQL Server; omitted for PostgreSQL, which the knowledge model is written in.
    public string? Dialect { get; set; }
}
