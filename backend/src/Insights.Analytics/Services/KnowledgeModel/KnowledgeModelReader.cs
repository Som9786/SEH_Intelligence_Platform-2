using System.Diagnostics;
using Insights.Analytics.Configuration;
using Insights.Analytics.Models;
using Insights.Analytics.Services.Data;
using Insights.Common;
using Microsoft.Extensions.Options;
using Neo4j.Driver;

namespace Insights.Analytics.Services.KnowledgeModel;

/// Reads the knowledge model from Neo4j: all of it, or the part a question is about, which is what the AI gets in its prompt.
/// A question's words are matched against the Term nodes (names and synonyms) to find the concepts and metrics it
/// names. The context then holds those concepts, the metrics measuring them, the concepts on the shortest
/// relationship path between them (so the AI sees how to join them), their tables and columns, the business rules
/// about any of them, and the verified examples that illustrate the most of them.
/// A question that names nothing gets the whole knowledge model.
/// The context's dialect is the data's database (PostgreSQL or SQL Server), and its tables carry their names in that
/// database; the formulas, rules and examples stay as written (PostgreSQL, unless an example says otherwise).
public sealed class KnowledgeModelReader(
    IDriver driver, IOptions<Neo4jOptions> neo4j, KnowledgeModelLoader loader, DataCoverageService coverage, PosBasketDatabase database,
    ILogger<KnowledgeModelReader> logger)
{
    /// Examples in a focused context, most relevant first.
    const int MaxExamples = 5;

    const string MatchTerms = """
        MATCH (t:Term)-[:MEANS]->(n) WHERE t.text IN $phrases
        RETURN DISTINCT n.name AS name, n:Concept AS isConcept
        """;

    const string MeasuredConcepts = """
        MATCH (m:Metric)-[:MEASURES]->(c:Concept) WHERE m.name IN $metrics
        RETURN DISTINCT c.name AS name
        """;

    // Metrics of the concepts the question names: "most baskets" names Basket, and Basket count says how to count it.
    const string ConceptMetrics = """
        MATCH (m:Metric)-[:MEASURES]->(c:Concept) WHERE c.name IN $concepts
        RETURN DISTINCT m.name AS name
        """;

    const string PathConcepts = """
        UNWIND $concepts AS a
        UNWIND $concepts AS b
        WITH a, b WHERE a < b
        MATCH (x:Concept {name: a})
        MATCH (y:Concept {name: b})
        MATCH p = shortestPath((x)-[:RELATES*..6]-(y))
        UNWIND nodes(p) AS n
        RETURN DISTINCT n.name AS name
        """;

    const string SelectConcepts = """
        MATCH (c:Concept)-[:STORED_IN]->(t:Table) WHERE $all OR c.name IN $concepts
        OPTIONAL MATCH (c)-[:HAS_ATTRIBUTE]->(a:Attribute)
        WITH c, t, a ORDER BY a.position
        WITH c, t, collect(a {.name, .expression, .description}) AS attributes
        RETURN c.name AS name, c.description AS description, t.name AS table, c.key AS key, attributes
        ORDER BY c.position
        """;

    const string SelectTables = """
        MATCH (t:Table)-[:HAS_COLUMN]->(col:Column) WHERE t.name IN $tables
        WITH t, col ORDER BY col.position
        RETURN t.name AS name, t.description AS description, collect(col {.name, .type, .description, .values}) AS columns
        ORDER BY name
        """;

    const string SelectRelationships = """
        MATCH (a:Concept)-[r:RELATES]->(b:Concept) WHERE $all OR (a.name IN $concepts AND b.name IN $concepts)
        RETURN r.name AS name, a.name AS from, b.name AS to, r.join AS join
        ORDER BY r.position
        """;

    const string SelectMetrics = """
        MATCH (m:Metric) WHERE $all OR m.name IN $metrics
        RETURN m.name AS name, m.description AS description, m.expression AS expression
        ORDER BY m.position
        """;

    // Rules about anything in the context, and rules about nothing in particular, which go with every question.
    const string SelectRules = """
        MATCH (r:Rule)
        WHERE $all OR NOT (r)-[:APPLIES_TO]->() OR EXISTS { (r)-[:APPLIES_TO]->(n) WHERE n.name IN $included }
        RETURN r.text AS text
        ORDER BY r.position
        """;

    // Ranked by how many of the question's concepts and metrics each example illustrates. Examples in the data's dialect
    // ($dialect: null for PostgreSQL, "SQL Server"), and on SQL Server also the PostgreSQL ones with no SQL Server version.
    const string SelectExamples = """
        MATCH (e:Example)
        WHERE CASE WHEN $dialect IS NULL THEN e.dialect IS NULL
              ELSE e.dialect = $dialect OR (e.dialect IS NULL AND NOT EXISTS {
                  MATCH (other:Example {dialect: $dialect}) WHERE toLower(other.question) = toLower(e.question) })
              END
        OPTIONAL MATCH (e)-[:ILLUSTRATES]->(n) WHERE n.name IN $matched
        WITH e, count(n) AS score
        WHERE $all OR score > 0
        RETURN e.question AS question, e.sql AS sql, e.dialect AS dialect
        ORDER BY score DESC, e.position
        LIMIT $limit
        """;

    public Task<KnowledgeModelContext> GetAllAsync(CancellationToken ct) => BuildAsync(null, ct);

    /// The part of the knowledge model the question (and its follow-up history) is about.
    public Task<KnowledgeModelContext> GetContextAsync(ContextRequest request, CancellationToken ct) => BuildAsync(request, ct);

    async Task<KnowledgeModelContext> BuildAsync(ContextRequest? request, CancellationToken ct)
    {
        await loader.EnsureLoadedAsync(ct);
        var timer = Stopwatch.StartNew();
        var data = await coverage.GetAsync(ct);
        await using var session = driver.AsyncSession(c => c.WithDatabase(neo4j.Value.Database).WithDefaultAccessMode(AccessMode.Read));
        var context = await session.ExecuteReadAsync(async tx =>
        {
            async Task<List<IRecord>> Query(string cypher, object parameters) =>
                await (await tx.RunAsync(cypher, parameters)).ToListAsync();
            static IEnumerable<IDictionary<string, object>> Maps(object value) =>
                value.As<List<object>>().Cast<IDictionary<string, object>>();
            static List<string> Names(List<IRecord> records) => records.Select(r => r["name"].As<string>()).ToList();

            List<string> matched = [], concepts = [], metrics = [];
            if (request is not null)
            {
                var phrases = Terms.Phrases(request.Question);
                foreach (var earlier in request.History ?? [])
                    phrases.UnionWith(Terms.Phrases(earlier));
                var hits = await Query(MatchTerms, new { phrases = phrases.ToList() });
                matched = Names(hits);
                concepts = hits.Where(h => h["isConcept"].As<bool>()).Select(h => h["name"].As<string>()).ToList();
                metrics = hits.Where(h => !h["isConcept"].As<bool>()).Select(h => h["name"].As<string>()).ToList();
                if (matched.Count > 0)
                {
                    metrics = metrics.Union(Names(await Query(ConceptMetrics, new { concepts }))).ToList();
                    concepts = concepts.Union(Names(await Query(MeasuredConcepts, new { metrics }))).ToList();
                    concepts = concepts.Union(Names(await Query(PathConcepts, new { concepts }))).ToList();
                }
            }
            // Nothing named, or no question: everything.
            var all = matched.Count == 0;
            var parameters = new
            {
                all, concepts, metrics, matched, included = concepts.Concat(metrics).ToList(), limit = all ? 1000 : MaxExamples,
                dialect = database.Provider == DataProvider.SqlServer ? database.Dialect : null,
            };

            var conceptRecords = await Query(SelectConcepts, parameters);
            var tables = conceptRecords.Select(r => r["table"].As<string>()).Distinct().ToList();
            var tableRecords = await Query(SelectTables, new { tables });
            // On SQL Server: tables by their name there (dbo.pos_basket_line), also inside rules and examples, and the
            // formulas and rules in T-SQL, since the AI copies them as given.
            var booleans = tableRecords.SelectMany(r => Maps(r["columns"]))
                .Where(c => Text(c, "type").Equals("boolean", StringComparison.OrdinalIgnoreCase)).Select(c => Text(c, "name")).ToHashSet();
            string Local(string text) => database.WithTableNames(text, tables);
            string Sql(string text) =>
                database.Provider == DataProvider.SqlServer ? SqlServerExpressions.Translate(Local(text), booleans) : text;

            var conceptInfos = conceptRecords.Select(r => new ConceptInfo(
                r["name"].As<string>(), r["description"].As<string>(), database.TableName(r["table"].As<string>()), Sql(r["key"].As<string>()),
                Maps(r["attributes"]).Select(a => new AttributeInfo(
                    Text(a, "name"), Sql(Text(a, "expression")), Sql(Text(a, "description")))).ToList())).ToList();
            var tableInfos = tableRecords.Select(r => new TableInfo(
                database.TableName(r["name"].As<string>()), r["description"].As<string>(),
                Maps(r["columns"]).Select(c => new ColumnInfo(
                    Text(c, "name"), database.ColumnType(Text(c, "type")), Text(c, "description"),
                    c.TryGetValue("values", out var v) && v is IEnumerable<object> values ? values.Select(x => x.ToString()!).ToList() : null))
                    .ToList())).ToList();
            var relationships = (await Query(SelectRelationships, parameters)).Select(r => new RelationshipInfo(
                r["name"].As<string>(), r["from"].As<string>(), r["to"].As<string>(), Sql(r["join"].As<string>()))).ToList();
            var metricInfos = (await Query(SelectMetrics, parameters)).Select(r => new MetricInfo(
                r["name"].As<string>(), r["description"].As<string>(), Sql(r["expression"].As<string>()))).ToList();
            var rules = (await Query(SelectRules, parameters)).Select(r => Sql(r["text"].As<string>())).ToList();
            var examples = (await Query(SelectExamples, parameters)).Select(r => new ExampleQuery(
                r["question"].As<string>(), Local(r["sql"].As<string>()), r["dialect"].As<string?>())).ToList();

            return new KnowledgeModelContext(database.Dialect, data.Coverage, matched, tableInfos, conceptInfos, relationships, metricInfos, rules, examples);
        });

        if (context.Concepts.Count == 0)
            logger.LogWarning("Knowledge model: Neo4j holds no concepts; check {File} and the last load", KnowledgeModelOptions.FileName);
        if (request is null)
            logger.LogInformation("Knowledge model: read all of it in {Ms} ms", timer.ElapsedMilliseconds);
        else
            logger.LogInformation("Context: \"{Question}\" names {Matched}; giving the AI {Concepts} ({Metrics} metrics, {Rules} rules, " +
                "{Examples} examples) in {Ms} ms", request.Question,
                context.Matched.Count > 0 ? string.Join(", ", context.Matched) : "nothing in the knowledge model, so it gets all of it",
                string.Join(", ", context.Concepts.Select(c => c.Name)), context.Metrics.Count, context.Rules.Count,
                context.Examples.Count, timer.ElapsedMilliseconds);
        return context;
    }

    static string Text(IDictionary<string, object> map, string key) =>
        map.TryGetValue(key, out var value) && value is not null ? value.ToString()! : "";
}
