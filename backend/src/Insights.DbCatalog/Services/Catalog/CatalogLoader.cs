using System.Diagnostics;
using Insights.DbCatalog.Configuration;
using Insights.DbCatalog.Models;
using Insights.Common;
using Microsoft.Extensions.Options;
using Neo4j.Driver;
using Row = System.Collections.Generic.Dictionary<string, object?>;

namespace Insights.DbCatalog.Services.Catalog;

/// Loads the database catalog export and db-catalog.json into Neo4j as the catalog graph:
/// (Database)-[:HAS_AREA]->(BusinessArea)-[:HAS_TABLE]->(Table)-[:HAS_COLUMN]->(Column),
/// (Table)-[:JOINS {condition, enforced, ...}]->(Table) from the referencing table, (Column)-[:REFERENCES]->(Column),
/// (Table)-[:HAS_INDEX|HAS_CONSTRAINT|HAS_TRIGGER]->(...), (Rule)-[:APPLIES_TO]->(Table) and
/// (Term)-[:MEANS]->(Table|Column|BusinessArea) for every name and synonym.
/// Every node also has the label Catalog, and a load replaces only those nodes, in one transaction: a question reads either
/// the old catalog or the new one, never half of each. The graph describes the database; it never holds its rows.
public sealed class CatalogLoader(
    IDriver driver, IOptions<Neo4jOptions> neo4j, CatalogFiles files, IOptionsMonitor<GuideOptions> guide, ILogger<CatalogLoader> logger)
{
    public const string SearchIndex = "catalog_text";

    static readonly string[] Schema =
    [
        "CREATE CONSTRAINT catalog_table_id IF NOT EXISTS FOR (n:Table) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT catalog_column_id IF NOT EXISTS FOR (n:Column) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT catalog_area_name IF NOT EXISTS FOR (n:BusinessArea) REQUIRE n.name IS UNIQUE",
        "CREATE CONSTRAINT catalog_term_text IF NOT EXISTS FOR (n:Term) REQUIRE n.text IS UNIQUE",
        // Searches what tables and columns mean, for questions whose words aren't a name or synonym. The English analyzer
        // ignores common words and matches "prices" with "price".
        $"CREATE FULLTEXT INDEX {SearchIndex} IF NOT EXISTS FOR (n:Table|Column) ON EACH [n.text] " +
        "OPTIONS {indexConfig: {`fulltext.analyzer`: 'english'}}",
    ];

    const string DeleteCatalog = "MATCH (n:Catalog) DETACH DELETE n";

    const string CreateDatabase = """
        UNWIND $rows AS d
        CREATE (:Catalog:Database {name: d.name, provider: d.provider, version: d.version, collation: d.collation, summary: d.summary})
        """;

    const string CreateTables = """
        UNWIND $rows AS t
        CREATE (tb:Catalog:Table {
            id: t.id, schema: t.schema, name: t.name, area: t.area, purpose: t.purpose, purposeEvidence: t.purposeEvidence,
            recordMeaning: t.recordMeaning, rowCount: t.rowCount, primaryKey: t.primaryKey, columnCount: size(t.columns),
            documentation: t.documentation, text: t.text})
        FOREACH (c IN t.columns |
            CREATE (tb)-[:HAS_COLUMN]->(:Catalog:Column {
                id: c.id, table: t.id, name: c.name, ordinal: c.ordinal, dataType: c.dataType, nullable: c.nullable,
                primaryKey: c.primaryKey, unique: c.unique, identity: c.identity, computed: c.computed, defaultValue: c.defaultValue,
                sensitivity: c.sensitivity, meaning: c.meaning, evidence: c.evidence, text: c.text}))
        FOREACH (i IN t.indexes |
            CREATE (tb)-[:HAS_INDEX]->(:Catalog:Index {
                table: t.id, name: i.name, columns: i.columns, includedColumns: i.includedColumns, unique: i.unique,
                clustered: i.clustered, filterPredicate: i.filterPredicate, position: i.position}))
        FOREACH (k IN t.constraints |
            CREATE (tb)-[:HAS_CONSTRAINT]->(:Catalog:Constraint {
                table: t.id, name: k.name, type: k.type, columns: k.columns, definition: k.definition, position: k.position}))
        FOREACH (g IN t.triggers |
            CREATE (tb)-[:HAS_TRIGGER]->(:Catalog:Trigger {
                table: t.id, name: g.name, events: g.events, timing: g.timing, enabled: g.enabled, summary: g.summary}))
        FOREACH (r IN t.rules |
            CREATE (:Catalog:Rule {table: t.id, text: r.text, evidence: r.evidence, position: r.position})-[:APPLIES_TO]->(tb))
        """;

    const string CreateAreas = """
        MATCH (d:Database)
        UNWIND $rows AS a
        CREATE (d)-[:HAS_AREA]->(x:Catalog:BusinessArea {name: a.name, purpose: a.purpose, position: a.position})
        WITH x, a
        UNWIND a.tables AS id
        MATCH (t:Table {id: id})
        CREATE (x)-[:HAS_TABLE]->(t)
        """;

    const string CreateJoins = """
        UNWIND $rows AS j
        MATCH (a:Table {id: j.from})
        MATCH (b:Table {id: j.to})
        CREATE (a)-[:JOINS {
            name: j.name, fromColumns: j.fromColumns, toColumns: j.toColumns, cardinality: j.cardinality, required: j.required,
            enforced: j.enforced, evidence: j.evidence, meaning: j.meaning, onDelete: j.onDelete, onUpdate: j.onUpdate,
            condition: j.condition, position: j.position}]->(b)
        """;

    const string CreateReferences = """
        UNWIND $rows AS r
        MATCH (a:Column {id: r.from})
        MATCH (b:Column {id: r.to})
        CREATE (a)-[:REFERENCES {enforced: r.enforced}]->(b)
        """;

    // Terms point at tables and columns by id and at business areas by name; these never collide (ids contain dots).
    const string CreateTerms = """
        UNWIND $rows AS t
        CREATE (term:Catalog:Term {text: t.text})
        WITH term, t
        UNWIND t.targets AS target
        OPTIONAL MATCH (tb:Table {id: target})
        OPTIONAL MATCH (c:Column {id: target})
        OPTIONAL MATCH (a:BusinessArea {name: target})
        WITH term, coalesce(tb, c, a) AS n WHERE n IS NOT NULL
        CREATE (term)-[:MEANS]->(n)
        """;

    readonly SemaphoreSlim gate = new(1, 1);
    volatile bool loaded;
    CatalogLoadStatus? last;

    /// The last load in this process, or null before the first.
    public CatalogLoadStatus? LastLoad => Volatile.Read(ref last);

    /// Loads the catalog unless this process already has; called before the graph is read, in case Neo4j was down at startup.
    public async Task EnsureLoadedAsync(CancellationToken ct)
    {
        if (!loaded)
            await LoadAsync(ct);
    }

    /// Replaces the catalog in Neo4j with what the export folder and db-catalog.json describe now. On a broken export, throws
    /// CatalogException and leaves the graph as it was.
    public async Task<CatalogLoadStatus> LoadAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            var timer = Stopwatch.StartNew();
            Plan plan;
            try
            {
                plan = Build(files.Read(), guide.CurrentValue);
            }
            catch (CatalogException e)
            {
                logger.LogError("Catalog: not loaded, the export has problems: {Problems}", e.Message);
                Volatile.Write(ref last, new(DateTimeOffset.UtcNow, false, e.Message, new Dictionary<string, int>()));
                throw;
            }
            logger.LogInformation("Catalog: loading {Folder} into Neo4j database {Database}: {Counts}",
                files.Folder, neo4j.Value.Database, string.Join(", ", plan.Counts.Select(c => $"{c.Value} {c.Key}")));

            await CreateSchemaAsync(ct);
            await using var session = driver.AsyncSession(c => c.WithDatabase(neo4j.Value.Database));
            await session.ExecuteWriteAsync(async tx =>
            {
                await (await tx.RunAsync(DeleteCatalog)).ConsumeAsync();
                foreach (var (cypher, rows) in plan.Statements)
                    await (await tx.RunAsync(cypher, new { rows })).ConsumeAsync();
            });

            loaded = true;
            var status = new CatalogLoadStatus(DateTimeOffset.UtcNow, true, null, plan.Counts);
            Volatile.Write(ref last, status);
            logger.LogInformation("Catalog: loaded in {Ms} ms", timer.ElapsedMilliseconds);
            return status;
        }
        catch (Exception e) when (e is not (CatalogException or OperationCanceledException))
        {
            logger.LogError(e, "Catalog: loading into Neo4j failed");
            Volatile.Write(ref last, new(DateTimeOffset.UtcNow, false, e.Message, new Dictionary<string, int>()));
            throw;
        }
        finally
        {
            gate.Release();
        }
    }

    /// Constraints and the search index, creating the Neo4j database first when it doesn't exist yet (Neo4j Desktop and
    /// Enterprise can; Community has only the database "neo4j").
    async Task CreateSchemaAsync(CancellationToken ct)
    {
        var database = neo4j.Value.Database;
        try
        {
            await RunSchemaAsync();
        }
        catch (ClientException e) when (e.Code == "Neo.ClientError.Database.DatabaseNotFound")
        {
            logger.LogInformation("Catalog: Neo4j database {Database} doesn't exist; creating it", database);
            try
            {
                await driver.ExecutableQuery("CREATE DATABASE $name IF NOT EXISTS WAIT").WithParameters(new { name = database })
                    .WithConfig(new QueryConfig(database: "system")).ExecuteAsync(ct);
            }
            catch (Neo4jException create)
            {
                throw new CatalogException($"Neo4j database {database} doesn't exist and couldn't be created ({create.Message}). " +
                    $"Create it on the system database with CREATE DATABASE `{database}`, or set Neo4j:Database to neo4j on Neo4j Community.");
            }
            await RunSchemaAsync();
        }

        async Task RunSchemaAsync()
        {
            foreach (var statement in Schema)
                await driver.ExecutableQuery(statement).WithConfig(new QueryConfig(database: database)).ExecuteAsync(ct);
        }
    }

    /// The write statements with their rows, and how many of each part the catalog has.
    sealed record Plan(List<(string Cypher, List<Row> Rows)> Statements, Dictionary<string, int> Counts);

    /// Turns the export into rows for the write statements. The export is already checked by CatalogFiles; this checks
    /// that every synonym in db-catalog.json names a table, column or business area.
    static Plan Build(CatalogExport export, GuideOptions guide)
    {
        var tables = export.Tables;
        var tableIds = tables.ToDictionary(t => t.Id, t => t.Id, StringComparer.OrdinalIgnoreCase);
        var columnIds = tables.SelectMany(t => t.Columns.Select(c => ColumnId(t.Id, c.Name)))
            .ToDictionary(id => id, id => id, StringComparer.OrdinalIgnoreCase);
        var areaNames = export.Areas.ToDictionary(a => a.Name, a => a.Name, StringComparer.OrdinalIgnoreCase);

        var problems = guide.Synonyms.Keys
            .Where(k => !tableIds.ContainsKey(k) && !columnIds.ContainsKey(k) && !areaNames.ContainsKey(k))
            .Select(k => $"{GuideOptions.FileName}: synonyms for \"{k}\", which isn't a table (schema.Table), column (schema.Table.Column) or business area")
            .ToList();
        if (problems.Count > 0)
            throw new CatalogException(string.Join("; ", problems) + ".");

        // Every normalized name and synonym, with what it means.
        var terms = new Dictionary<string, SortedSet<string>>();
        void AddTerms(string target, IEnumerable<string> words)
        {
            foreach (var term in words.Select(Terms.Normalize).Where(t => t.Length > 0))
                (terms.TryGetValue(term, out var set) ? set : terms[term] = new(StringComparer.Ordinal)).Add(target);
        }
        List<string> Synonyms(string key) => guide.Synonyms.TryGetValue(key, out var words) ? words : [];
        foreach (var t in tables)
        {
            AddTerms(t.Id, [t.Id, t.Name, .. Synonyms(t.Id)]);
            foreach (var c in t.Columns)
                AddTerms(ColumnId(t.Id, c.Name), [c.Name, .. Synonyms(ColumnId(t.Id, c.Name))]);
        }
        foreach (var a in export.Areas)
            AddTerms(a.Name, [a.Name, .. Synonyms(a.Name)]);

        var d = export.Database.Database;
        var databaseRows = new List<Row>
        {
            new() { ["name"] = d.Name, ["provider"] = d.Provider, ["version"] = d.ProductVersion, ["collation"] = d.Collation, ["summary"] = d.Summary?.Text },
        };

        var tableRows = tables.Select(t => new Row
        {
            ["id"] = t.Id, ["schema"] = t.Schema, ["name"] = t.Name, ["area"] = t.BusinessArea,
            ["purpose"] = t.Purpose?.Text, ["purposeEvidence"] = t.Purpose?.Evidence, ["recordMeaning"] = t.RecordMeaning?.Text,
            ["rowCount"] = t.RowCount, ["primaryKey"] = List(t.PrimaryKey),
            ["documentation"] = export.Documentation.GetValueOrDefault(t.Id),
            ["text"] = SearchText(t.Name, t.Purpose?.Text, t.RecordMeaning?.Text),
            ["columns"] = t.Columns.Select(c => (object?)new Row
            {
                ["id"] = ColumnId(t.Id, c.Name), ["name"] = c.Name, ["ordinal"] = c.Ordinal, ["dataType"] = c.DataType,
                ["nullable"] = c.Nullable, ["primaryKey"] = c.PrimaryKey, ["unique"] = c.Unique, ["identity"] = c.Identity,
                ["computed"] = c.Computed, ["defaultValue"] = c.Default, ["sensitivity"] = c.Sensitivity,
                ["meaning"] = c.Meaning?.Text, ["evidence"] = c.Meaning?.Evidence,
                ["text"] = SearchText(c.Name, c.Meaning?.Text),
            }).ToList(),
            ["indexes"] = (t.Indexes ?? []).Select((i, n) => (object?)new Row
            {
                ["name"] = i.Name, ["columns"] = List(i.Columns), ["includedColumns"] = List(i.IncludedColumns), ["unique"] = i.Unique,
                ["clustered"] = i.Clustered, ["filterPredicate"] = i.Filter, ["position"] = n,
            }).ToList(),
            ["constraints"] = (t.Constraints ?? []).Select((k, n) => (object?)new Row
            {
                ["name"] = k.Name, ["type"] = k.Type, ["columns"] = List(k.Columns), ["definition"] = k.Definition, ["position"] = n,
            }).ToList(),
            ["triggers"] = (t.Triggers ?? []).Select(g => (object?)new Row
            {
                ["name"] = g.Name, ["events"] = List(g.Events), ["timing"] = g.Timing, ["enabled"] = g.Enabled, ["summary"] = g.Summary,
            }).ToList(),
            ["rules"] = (t.BusinessRules ?? []).Where(r => !string.IsNullOrWhiteSpace(r.Text)).Select((r, n) => (object?)new Row
            {
                ["text"] = r.Text.Trim(), ["evidence"] = r.Evidence, ["position"] = n,
            }).ToList(),
        }).ToList();

        var areaRows = export.Areas.Select((a, n) => new Row
        {
            ["name"] = a.Name, ["purpose"] = a.Purpose, ["position"] = n,
            ["tables"] = a.Tables.Select(t => (object?)tableIds[t]).ToList(),
        }).ToList();

        var joinRows = export.Relationships.Select((r, n) => new Row
        {
            ["name"] = r.Name, ["from"] = tableIds[r.From.Table], ["to"] = tableIds[r.To.Table],
            ["fromColumns"] = List(r.From.Columns), ["toColumns"] = List(r.To.Columns), ["cardinality"] = r.Cardinality,
            ["required"] = r.FromRequired, ["enforced"] = r.Enforced, ["evidence"] = r.Evidence, ["meaning"] = r.Meaning,
            ["onDelete"] = r.OnDelete, ["onUpdate"] = r.OnUpdate, ["position"] = n, ["condition"] = JoinCondition(r),
        }).ToList();
        var referenceRows = export.Relationships.SelectMany(r => r.From.Columns.Zip(r.To.Columns, (f, t) => new Row
        {
            ["from"] = columnIds[ColumnId(r.From.Table, f)], ["to"] = columnIds[ColumnId(r.To.Table, t)], ["enforced"] = r.Enforced,
        })).ToList();

        var termRows = terms.Select(t => new Row { ["text"] = t.Key, ["targets"] = t.Value.Cast<object?>().ToList() }).ToList();

        return new(
            [
                (CreateDatabase, databaseRows),
                (CreateTables, tableRows),
                (CreateAreas, areaRows),
                (CreateJoins, joinRows),
                (CreateReferences, referenceRows),
                (CreateTerms, termRows),
            ],
            new()
            {
                ["tables"] = tables.Count, ["columns"] = tables.Sum(t => t.Columns.Count), ["relationships"] = export.Relationships.Count,
                ["areas"] = export.Areas.Count, ["rules"] = tables.Sum(t => t.BusinessRules?.Count ?? 0), ["terms"] = terms.Count,
                ["documents"] = export.Documentation.Count,
            });
    }

    /// schema.Table.Column.
    public static string ColumnId(string table, string column) => $"{table}.{column}";

    /// The SQL join condition, column by column: sales.OrderItems.OrderId = sales.Orders.OrderId.
    static string JoinCondition(RelationshipEntry r) =>
        string.Join(" AND ", r.From.Columns.Zip(r.To.Columns, (f, t) => $"{r.From.Table}.{f} = {r.To.Table}.{t}"));

    /// What the search index reads: the name split into words (UnitPrice -> unit price) and the descriptions.
    static string SearchText(string name, params string?[] texts) =>
        string.Join(". ", texts.Where(t => !string.IsNullOrWhiteSpace(t)).Prepend(Terms.Normalize(name)));

    static List<object?> List(IEnumerable<string>? values) => (values ?? []).Cast<object?>().ToList();
}
