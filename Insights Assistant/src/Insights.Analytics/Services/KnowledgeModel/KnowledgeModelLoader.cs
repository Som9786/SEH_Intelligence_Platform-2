using System.Diagnostics;
using System.Text.RegularExpressions;
using Insights.Analytics.Configuration;
using Insights.Analytics.Models;
using Insights.Analytics.Services.Data;
using Microsoft.Extensions.Options;
using Neo4j.Driver;
using Row = System.Collections.Generic.Dictionary<string, object?>;

namespace Insights.Analytics.Services.KnowledgeModel;

/// Loads knowledge-model.json, business-rules.json and query-examples.json into Neo4j as the knowledge model graph:
/// (Concept)-[:STORED_IN]->(Table)-[:HAS_COLUMN]->(Column), (Concept)-[:HAS_ATTRIBUTE]->(Attribute)-[:READS]->(Column),
/// (Concept)-[:RELATES {name, join}]->(Concept), (Metric)-[:MEASURES]->(Concept), (Term)-[:MEANS]->(Concept|Metric),
/// (Rule)-[:APPLIES_TO]->(Concept|Metric) and (Example)-[:ILLUSTRATES]->(Concept|Metric).
/// Every node also has the label Knowledge model, and a load replaces only those nodes, in one transaction: a question reads
/// either the old knowledge model or the new one, never half of each, and anything else in the database is left alone.
/// The graph never holds sales data; that stays in PostgreSQL.
public sealed partial class KnowledgeModelLoader(
    IDriver driver, IOptions<Neo4jOptions> neo4j, IOptionsMonitor<KnowledgeModelOptions> knowledgeModel, IOptionsMonitor<DatasetOptions> dataset,
    DataCoverageService coverage, ILogger<KnowledgeModelLoader> logger)
{
    static readonly string[] Constraints =
    [
        "CREATE CONSTRAINT knowledge_model_table_name IF NOT EXISTS FOR (n:Table) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT knowledge_model_concept_name IF NOT EXISTS FOR (n:Concept) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT knowledge_model_metric_name IF NOT EXISTS FOR (n:Metric) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT knowledge_model_term_text IF NOT EXISTS FOR (n:Term) REQUIRE n.text IS UNIQUE",
    ];

    const string DeleteKnowledgeModel = "MATCH (n:KnowledgeModel) DETACH DELETE n";

    const string CreateTables = """
        UNWIND $rows AS t
        CREATE (tb:KnowledgeModel:Table {name: t.name, description: t.description, dateColumn: t.dateColumn})
        FOREACH (c IN t.columns |
            CREATE (tb)-[:HAS_COLUMN]->(:KnowledgeModel:Column {
                table: t.name, name: c.name, type: c.type, description: c.description, values: c.values, position: c.position}))
        """;

    const string CreateConcepts = """
        UNWIND $rows AS c
        MATCH (tb:Table {name: c.table})
        CREATE (x:KnowledgeModel:Concept {name: c.name, description: c.description, key: c.key, position: c.position})-[:STORED_IN]->(tb)
        FOREACH (a IN c.attributes |
            CREATE (x)-[:HAS_ATTRIBUTE]->(:KnowledgeModel:Attribute {
                concept: c.name, name: a.name, expression: a.expression, description: a.description, position: a.position}))
        """;

    const string LinkAttributeColumns = """
        UNWIND $rows AS r
        MATCH (:Concept {name: r.owner})-[:HAS_ATTRIBUTE]->(a:Attribute {name: r.name})
        MATCH (:Table {name: r.table})-[:HAS_COLUMN]->(col:Column {name: r.column})
        CREATE (a)-[:READS]->(col)
        """;

    const string CreateRelationships = """
        UNWIND $rows AS r
        MATCH (a:Concept {name: r.from})
        MATCH (b:Concept {name: r.to})
        CREATE (a)-[:RELATES {name: r.name, join: r.join, position: r.position}]->(b)
        """;

    const string CreateMetrics = """
        UNWIND $rows AS m
        CREATE (x:KnowledgeModel:Metric {name: m.name, description: m.description, expression: m.expression, position: m.position})
        WITH x, m
        UNWIND m.concepts AS name
        MATCH (c:Concept {name: name})
        CREATE (x)-[:MEASURES]->(c)
        """;

    const string LinkMetricColumns = """
        UNWIND $rows AS r
        MATCH (m:Metric {name: r.owner})
        MATCH (:Table {name: r.table})-[:HAS_COLUMN]->(col:Column {name: r.column})
        CREATE (m)-[:READS]->(col)
        """;

    // Terms, rules and examples point at concepts and metrics by name; names are unique across both.
    const string CreateTerms = """
        UNWIND $rows AS t
        CREATE (term:KnowledgeModel:Term {text: t.text})
        WITH term, t
        UNWIND t.targets AS name
        OPTIONAL MATCH (c:Concept {name: name})
        OPTIONAL MATCH (m:Metric {name: name})
        WITH term, coalesce(c, m) AS n WHERE n IS NOT NULL
        CREATE (term)-[:MEANS]->(n)
        """;

    const string CreateRules = """
        UNWIND $rows AS r
        CREATE (x:KnowledgeModel:Rule {text: r.text, position: r.position})
        WITH x, r
        UNWIND r.targets AS name
        OPTIONAL MATCH (c:Concept {name: name})
        OPTIONAL MATCH (m:Metric {name: name})
        WITH x, coalesce(c, m) AS n WHERE n IS NOT NULL
        CREATE (x)-[:APPLIES_TO]->(n)
        """;

    const string CreateExamples = """
        UNWIND $rows AS e
        CREATE (x:KnowledgeModel:Example {question: e.question, sql: e.sql, position: e.position})
        WITH x, e
        UNWIND e.targets AS name
        OPTIONAL MATCH (c:Concept {name: name})
        OPTIONAL MATCH (m:Metric {name: name})
        WITH x, coalesce(c, m) AS n WHERE n IS NOT NULL
        CREATE (x)-[:ILLUSTRATES]->(n)
        """;

    readonly SemaphoreSlim gate = new(1, 1);
    volatile bool loaded;
    KnowledgeModelLoadStatus? last;

    /// The last load in this process, or null before the first.
    public KnowledgeModelLoadStatus? LastLoad => Volatile.Read(ref last);

    /// Loads the knowledge model unless this process already has; called before the graph is read, in case Neo4j was down at startup.
    public async Task EnsureLoadedAsync(CancellationToken ct)
    {
        if (!loaded)
            await LoadAsync(ct);
    }

    /// Replaces the knowledge model in Neo4j with what the files describe now. On an invalid file, throws KnowledgeModelException
    /// and leaves the graph as it was.
    public async Task<KnowledgeModelLoadStatus> LoadAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            var timer = Stopwatch.StartNew();
            Plan plan;
            try
            {
                plan = Build(knowledgeModel.CurrentValue, dataset.CurrentValue);
            }
            catch (KnowledgeModelException e)
            {
                logger.LogError("Knowledge model: not loaded, the files have problems: {Problems}", e.Message);
                Volatile.Write(ref last, new(DateTimeOffset.UtcNow, false, e.Message, new Dictionary<string, int>()));
                throw;
            }
            logger.LogInformation("Knowledge model: loading into Neo4j database {Database}: {Counts}",
                neo4j.Value.Database, string.Join(", ", plan.Counts.Select(c => $"{c.Value} {c.Key}")));

            foreach (var statement in Constraints)
                await driver.ExecutableQuery(statement).WithConfig(new QueryConfig(database: neo4j.Value.Database)).ExecuteAsync(ct);
            await using var session = driver.AsyncSession(c => c.WithDatabase(neo4j.Value.Database));
            await session.ExecuteWriteAsync(async tx =>
            {
                await (await tx.RunAsync(DeleteKnowledgeModel)).ConsumeAsync();
                foreach (var (cypher, rows) in plan.Statements)
                    await (await tx.RunAsync(cypher, new { rows })).ConsumeAsync();
            });

            loaded = true;
            // A table or its date column may have changed.
            coverage.Invalidate();
            var status = new KnowledgeModelLoadStatus(DateTimeOffset.UtcNow, true, null, plan.Counts);
            Volatile.Write(ref last, status);
            logger.LogInformation("Knowledge model: loaded in {Ms} ms", timer.ElapsedMilliseconds);
            return status;
        }
        catch (Exception e) when (e is not (KnowledgeModelException or OperationCanceledException))
        {
            logger.LogError(e, "Knowledge model: loading into Neo4j failed");
            Volatile.Write(ref last, new(DateTimeOffset.UtcNow, false, e.Message, new Dictionary<string, int>()));
            throw;
        }
        finally
        {
            gate.Release();
        }
    }

    /// The write statements with their rows, and how many of each part the knowledge model has.
    sealed record Plan(List<(string Cypher, List<Row> Rows)> Statements, Dictionary<string, int> Counts);

    /// Checks the files describe one consistent knowledge model and turns them into rows for the write statements.
    static Plan Build(KnowledgeModelOptions o, DatasetOptions d)
    {
        var problems = new List<string>();
        void Unique(IEnumerable<string> names, string what)
        {
            foreach (var g in names.GroupBy(n => n, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1))
                problems.Add($"{what} \"{g.Key}\" is defined {g.Count()} times");
        }

        var tables = o.Tables.Where(t => !string.IsNullOrWhiteSpace(t.Name)).ToList();
        if (tables.Count == 0)
            problems.Add($"{KnowledgeModelOptions.FileName} lists no tables");
        Unique(tables.Select(t => t.Name), "Table");
        foreach (var t in tables)
        {
            Unique(t.Columns.Select(c => c.Name), $"Column of {t.Name}");
            if (t.DateColumn is { Length: > 0 } dateColumn && !t.Columns.Any(c => Same(c.Name, dateColumn)))
                problems.Add($"Table {t.Name}'s DateColumn \"{dateColumn}\" isn't one of its columns");
        }
        var tableByName = tables.DistinctBy(t => t.Name, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(t => t.Name, StringComparer.OrdinalIgnoreCase);

        var concepts = o.Concepts.Where(c => !string.IsNullOrWhiteSpace(c.Name)).ToList();
        if (concepts.Count == 0)
            problems.Add($"{KnowledgeModelOptions.FileName} lists no concepts");
        Unique(concepts.Select(c => c.Name), "Concept");
        foreach (var c in concepts)
        {
            if (!tableByName.ContainsKey(c.Table))
                problems.Add($"Concept {c.Name} is stored in \"{c.Table}\", which isn't in Tables");
            if (string.IsNullOrWhiteSpace(c.Key))
                problems.Add($"Concept {c.Name} has no Key");
        }
        var metrics = o.Metrics.Where(m => !string.IsNullOrWhiteSpace(m.Name)).ToList();
        Unique(metrics.Select(m => m.Name), "Metric");
        // Rules, examples and terms point at concepts and metrics by name, so a name can only mean one of them.
        foreach (var m in metrics.Where(m => concepts.Any(c => Same(c.Name, m.Name))))
            problems.Add($"\"{m.Name}\" is both a concept and a metric");

        var conceptNames = concepts.Select(c => c.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var targetNames = conceptNames.Concat(metrics.Select(m => m.Name)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var r in o.Relationships)
            foreach (var end in new[] { r.From, r.To }.Where(e => !conceptNames.Contains(e)))
                problems.Add($"Relationship {r.Name} connects \"{end}\", which isn't a concept");
        foreach (var m in metrics)
            foreach (var name in m.Concepts.Where(n => !conceptNames.Contains(n)))
                problems.Add($"Metric {m.Name} measures \"{name}\", which isn't a concept");
        var rules = d.BusinessRules.Where(r => !string.IsNullOrWhiteSpace(r.Text)).ToList();
        foreach (var r in rules)
            foreach (var name in r.AppliesTo.Where(n => !targetNames.Contains(n)))
                problems.Add($"{DatasetOptions.RulesFileName}: a rule applies to \"{name}\", which isn't a concept or metric " +
                    $"(\"{Shorten(r.Text)}\")");
        if (problems.Count > 0)
            throw new KnowledgeModelException(string.Join("; ", problems) + ".");

        // The defined spelling of a concept or metric name, for references written in another case.
        var canonical = concepts.Select(c => c.Name).Concat(metrics.Select(m => m.Name))
            .ToDictionary(n => n, n => n, StringComparer.OrdinalIgnoreCase);

        // Every normalized name and synonym, with what it means.
        var terms = new Dictionary<string, SortedSet<string>>();
        void AddTerms(string target, IEnumerable<string> words)
        {
            foreach (var term in words.Prepend(target).Select(Terms.Normalize).Where(t => t.Length > 0))
                (terms.TryGetValue(term, out var set) ? set : terms[term] = new(StringComparer.Ordinal)).Add(target);
        }
        foreach (var c in concepts)
            AddTerms(c.Name, c.Synonyms);
        foreach (var m in metrics)
            AddTerms(m.Name, m.Synonyms);

        var tableRows = tables.Select(t => new Row
        {
            ["name"] = t.Name, ["description"] = t.Description, ["dateColumn"] = t.DateColumn,
            ["columns"] = t.Columns.Select((c, i) => (object?)new Row
            {
                ["name"] = c.Name, ["type"] = c.Type, ["description"] = c.Description,
                ["values"] = c.Values?.Cast<object?>().ToList(), ["position"] = i,
            }).ToList(),
        }).ToList();

        var conceptRows = concepts.Select((c, i) => new Row
        {
            ["name"] = c.Name, ["description"] = c.Description, ["table"] = tableByName[c.Table].Name, ["key"] = c.Key, ["position"] = i,
            ["attributes"] = c.Attributes.Where(a => !string.IsNullOrWhiteSpace(a.Name)).Select((a, j) => (object?)new Row
            {
                ["name"] = a.Name, ["expression"] = a.Expression, ["description"] = a.Description, ["position"] = j,
            }).ToList(),
        }).ToList();
        var attributeColumns = concepts.SelectMany(c => c.Attributes.SelectMany(a =>
            ColumnsIn(a.Expression, tableByName[c.Table]).Select(col => new Row
            {
                ["owner"] = c.Name, ["name"] = a.Name, ["table"] = tableByName[c.Table].Name, ["column"] = col,
            }))).ToList();

        var relationshipRows = o.Relationships.Select((r, i) => new Row
        {
            ["name"] = r.Name, ["from"] = canonical[r.From], ["to"] = canonical[r.To], ["join"] = r.Join, ["position"] = i,
        }).ToList();

        var metricRows = metrics.Select((m, i) => new Row
        {
            ["name"] = m.Name, ["description"] = m.Description, ["expression"] = m.Expression, ["position"] = i,
            ["concepts"] = m.Concepts.Select(n => (object?)canonical[n]).ToList(),
        }).ToList();
        // A metric's columns are in the tables of the concepts it measures.
        var metricColumns = metrics.SelectMany(m => m.Concepts
            .Select(n => tableByName[concepts.First(c => Same(c.Name, n)).Table]).Distinct()
            .SelectMany(t => ColumnsIn(m.Expression, t).Select(col => new Row
            {
                ["owner"] = m.Name, ["table"] = t.Name, ["column"] = col,
            }))).ToList();

        var termRows = terms.Select(t => new Row
        {
            ["text"] = t.Key, ["targets"] = t.Value.Cast<object?>().ToList(),
        }).ToList();

        var ruleRows = rules.Select((r, i) => new Row
        {
            ["text"] = r.Text.Trim(), ["position"] = i, ["targets"] = r.AppliesTo.Select(n => (object?)canonical[n]).Distinct().ToList(),
        }).ToList();

        // An example illustrates whatever its question's words name, the same way a new question is matched.
        var examples = d.Examples.Where(e => !string.IsNullOrWhiteSpace(e.Question) && !string.IsNullOrWhiteSpace(e.Sql)).ToList();
        var exampleRows = examples.Select((e, i) => new Row
        {
            ["question"] = e.Question.Trim(), ["sql"] = e.Sql.Trim(), ["position"] = i,
            ["targets"] = Terms.Phrases(e.Question).Where(terms.ContainsKey).SelectMany(p => terms[p]).Distinct().Cast<object?>().ToList(),
        }).ToList();

        return new(
            [
                (CreateTables, tableRows),
                (CreateConcepts, conceptRows),
                (LinkAttributeColumns, attributeColumns),
                (CreateRelationships, relationshipRows),
                (CreateMetrics, metricRows),
                (LinkMetricColumns, metricColumns),
                (CreateTerms, termRows),
                (CreateRules, ruleRows),
                (CreateExamples, exampleRows),
            ],
            new()
            {
                ["tables"] = tables.Count, ["columns"] = tables.Sum(t => t.Columns.Count), ["concepts"] = concepts.Count,
                ["relationships"] = o.Relationships.Count, ["metrics"] = metrics.Count, ["terms"] = terms.Count,
                ["rules"] = rules.Count, ["examples"] = examples.Count,
            });
    }

    /// The table's columns that a SQL expression mentions.
    static IEnumerable<string> ColumnsIn(string expression, TableDefinition table)
    {
        var words = Identifier().Matches(expression).Select(m => m.Value).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return table.Columns.Where(c => words.Contains(c.Name)).Select(c => c.Name);
    }

    static bool Same(string a, string b) => string.Equals(a, b, StringComparison.OrdinalIgnoreCase);

    static string Shorten(string text) => text.Length > 60 ? text[..57] + "..." : text;

    [GeneratedRegex("[A-Za-z_][A-Za-z0-9_]*")]
    private static partial Regex Identifier();
}
