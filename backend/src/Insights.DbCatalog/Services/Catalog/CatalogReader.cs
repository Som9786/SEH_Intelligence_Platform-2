using System.Diagnostics;
using System.Text.RegularExpressions;
using Insights.DbCatalog.Configuration;
using Insights.DbCatalog.Models;
using Insights.Common;
using Microsoft.Extensions.Options;
using Neo4j.Driver;
using Map = System.Collections.Generic.IDictionary<string, object>;

namespace Insights.DbCatalog.Services.Catalog;

/// Reads the catalog graph from Neo4j: the overview for the page, one table in full, or the part a question is about,
/// which is what the AI gets in its prompt.
/// A question picks tables three ways: its words match a table's name or synonym (strongest), a column's name or
/// synonym, or a business area; and a full-text search over what tables and columns mean finds the rest ("where is the
/// price including tax?"). The best-scoring tables are kept, then the tables on the shortest chain of joins between
/// each pair are added, so the AI sees how to join them. A question that picks nothing gets every table, in brief.
public sealed partial class CatalogReader(
    IDriver driver, IOptions<Neo4jOptions> neo4j, CatalogLoader loader, ILogger<CatalogReader> logger)
{
    /// Tables a question picks, best first; join paths can add more, up to MaxContextTables.
    const int MaxTables = 6;
    const int MaxContextTables = 10;
    /// Longest chain of joins looked for between two picked tables.
    const int MaxJoinHops = 3;
    /// A table is kept when it scores at least this share of the best table's score.
    const double KeepShare = 0.25;
    /// Earlier questions in the conversation count this much against the current one.
    const double HistoryWeight = 0.5;

    const string SelectDatabase = "MATCH (d:Database) RETURN d.name AS name, d.provider AS provider, d.version AS version, d.summary AS summary";

    const string MatchTerms = """
        MATCH (t:Term)-[:MEANS]->(n) WHERE t.text IN $phrases
        RETURN t.text AS term,
               CASE WHEN n:Table THEN 'table' WHEN n:Column THEN 'column' ELSE 'area' END AS kind,
               coalesce(n.id, n.name) AS key,
               CASE WHEN n:BusinessArea THEN [(n)-[:HAS_TABLE]->(x) | x.id] WHEN n:Column THEN [n.table] ELSE [n.id] END AS tables
        """;

    const string Search = """
        CALL db.index.fulltext.queryNodes($index, $query) YIELD node, score
        RETURN CASE WHEN node:Table THEN node.id ELSE node.table END AS table,
               CASE WHEN node:Column THEN node.name END AS column, score
        ORDER BY score DESC
        LIMIT 20
        """;

    static readonly string JoinPaths = $$"""
        UNWIND $pairs AS pair
        MATCH (a:Table {id: pair[0]})
        MATCH (b:Table {id: pair[1]})
        MATCH p = shortestPath((a)-[:JOINS*..{{MaxJoinHops}}]-(b))
        RETURN pair[0] AS from, pair[1] AS to, [r IN relationships(p) | r {.*, from: startNode(r).id, to: endNode(r).id}] AS steps
        """;

    const string SelectTables = """
        MATCH (t:Table) WHERE $all OR t.id IN $ids
        RETURN t {.id, .area, .purpose, .purposeEvidence, .recordMeaning, .rowCount, .primaryKey} AS table,
               CASE WHEN $withDocumentation THEN t.documentation END AS documentation,
               [(t)-[:HAS_COLUMN]->(c) | c {.*, references: head([(c)-[:REFERENCES]->(x) | x.id])}] AS columns,
               [(t)-[:HAS_INDEX]->(i) | i {.*}] AS indexes,
               [(t)-[:HAS_CONSTRAINT]->(k) | k {.*}] AS constraints,
               [(t)-[:HAS_TRIGGER]->(g) | g {.*}] AS triggers,
               [(r:Rule)-[:APPLIES_TO]->(t) | r {.*}] AS rules,
               [(t)-[j:JOINS]-() | j {.*, from: startNode(j).id, to: endNode(j).id}] AS joins
        ORDER BY t.id
        """;

    const string SelectSummaries = """
        MATCH (t:Table) WHERE $all OR NOT t.id IN $ids
        RETURN t.id AS id, t.area AS area, t.purpose AS purpose, t.rowCount AS rowCount, t.columnCount AS columnCount
        ORDER BY t.id
        """;

    const string SelectAreas = """
        MATCH (a:BusinessArea)
        RETURN a.name AS name, a.purpose AS purpose, [(a)-[:HAS_TABLE]->(t) | t.id] AS tables
        ORDER BY a.position
        """;

    const string SelectJoins = """
        MATCH (a:Table)-[j:JOINS]->(b:Table)
        RETURN j {.*, from: a.id, to: b.id} AS join
        ORDER BY j.position
        """;

    // Words that say what kind of answer is wanted rather than what it's about; searching for them finds every table.
    static readonly HashSet<string> QuestionWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "which", "what", "where", "when", "how", "why", "who", "whom", "does", "did", "should", "would", "could", "can",
        "use", "used", "using", "get", "find", "show", "list", "give", "tell", "need", "want", "join", "joins", "joined",
        "joining", "link", "linked", "relate", "related", "table", "tables", "column", "columns", "field", "fields", "data",
        "database", "stored", "store", "kept", "hold", "holds", "query", "sql", "write", "each", "all", "any", "there",
        "about", "from", "have", "has", "between", "together", "also", "and", "the", "for", "with", "its", "their", "you",
    };

    public async Task<CatalogOverview> GetOverviewAsync(CancellationToken ct)
    {
        await loader.EnsureLoadedAsync(ct);
        return await ReadAsync(async tx =>
        {
            var database = await DatabaseAsync(tx);
            var areas = (await QueryAsync(tx, SelectAreas, new { })).Select(r => new AreaInfo(
                r["name"].As<string>(), r["purpose"].As<string?>(), Strings(r["tables"]))).ToList();
            var tables = await SummariesAsync(tx, all: true, []);
            var joins = (await QueryAsync(tx, SelectJoins, new { })).Select(r => Join(r["join"].As<Map>())).ToList();
            return new CatalogOverview(database, loader.LastLoad?.Counts ?? new Dictionary<string, int>(), areas, tables, joins);
        }, ct);
    }

    /// One table in full, with its documentation page; null when the catalog has no such table.
    public async Task<TableDetail?> GetTableAsync(string id, CancellationToken ct)
    {
        await loader.EnsureLoadedAsync(ct);
        return await ReadAsync(async tx => (await TablesAsync(tx, all: false, [id], withDocumentation: true, brief: false))
            .FirstOrDefault(t => string.Equals(t.Id, id, StringComparison.OrdinalIgnoreCase)), ct);
    }

    /// The part of the catalog the question (and the conversation's earlier questions) is about.
    public async Task<GuideContext> GetContextAsync(string question, IReadOnlyList<string> history, CancellationToken ct)
    {
        await loader.EnsureLoadedAsync(ct);
        var timer = Stopwatch.StartNew();
        var context = await ReadAsync(async tx =>
        {
            var database = await DatabaseAsync(tx);
            var scores = new Dictionary<string, (double Score, List<string> Why)>(StringComparer.OrdinalIgnoreCase);
            void Add(string table, double score, string why)
            {
                var entry = scores.TryGetValue(table, out var e) ? e : (0, []);
                if (!entry.Why.Contains(why))
                    entry.Why.Add(why);
                scores[table] = (entry.Score + score, entry.Why);
            }

            foreach (var (text, weight) in history.Select(h => (h, HistoryWeight)).Prepend((question, 1.0)))
                await ScoreAsync(tx, text, weight, Add);

            var best = scores.Count > 0 ? scores.Values.Max(s => s.Score) : 0;
            var picked = scores.Where(s => s.Value.Score >= best * KeepShare)
                .OrderByDescending(s => s.Value.Score).ThenBy(s => s.Key).Take(MaxTables).ToList();
            if (picked.Count == 0)
                return new GuideContext(database, true, [],
                    await TablesAsync(tx, all: true, [], withDocumentation: false, brief: true), [], []);

            var matched = picked.Select(p => new MatchInfo(p.Key, string.Join("; ", p.Value.Why.Take(3)))).ToList();
            var ids = picked.Select(p => p.Key).ToList();
            var paths = await JoinPathsAsync(tx, ids);
            // The tables a join path passes through, so every step of it is described.
            foreach (var id in paths.SelectMany(p => p.Steps).SelectMany(s => new[] { s.From, s.To }))
                if (!ids.Contains(id, StringComparer.OrdinalIgnoreCase) && ids.Count < MaxContextTables)
                    ids.Add(id);

            var tables = await TablesAsync(tx, all: false, ids, withDocumentation: false, brief: false);
            var others = await SummariesAsync(tx, all: false, ids);
            return new GuideContext(database, false, matched, tables, paths, others);
        }, ct);

        logger.LogInformation("Context: \"{Question}\" picks {Matched}; giving the AI {Tables} tables and {Paths} join paths in {Ms} ms",
            question, context.All ? "no table, so it gets every table in brief" : string.Join(", ", context.Matched.Select(m => $"{m.Table} ({m.Why})")),
            context.Tables.Count, context.JoinPaths.Count, timer.ElapsedMilliseconds);
        return context;
    }

    /// Scores tables by the text's words: names and synonyms of tables, columns and areas, then the full-text search.
    async Task ScoreAsync(IAsyncQueryRunner tx, string text, double weight, Action<string, double, string> add)
    {
        var hits = await QueryAsync(tx, MatchTerms, new { phrases = Terms.Phrases(text).ToList() });
        // A column name shared by many tables (Name, Email, ModifiedAt) says less about which table is meant.
        var tablesPerTerm = hits.Where(h => h["kind"].As<string>() == "column")
            .GroupBy(h => h["term"].As<string>()).ToDictionary(g => g.Key, g => g.SelectMany(h => Strings(h["tables"])).Distinct().Count());
        foreach (var h in hits)
        {
            var term = h["term"].As<string>();
            var key = h["key"].As<string>();
            switch (h["kind"].As<string>())
            {
                case "table":
                    add(key, 3 * weight, $"\"{term}\" names it");
                    break;
                case "column":
                    add(Strings(h["tables"])[0], 2.0 / tablesPerTerm[term] * weight, $"\"{term}\" names column {key[(key.LastIndexOf('.') + 1)..]}");
                    break;
                default:
                    foreach (var table in Strings(h["tables"]))
                        add(table, 1 * weight, $"\"{term}\" names its business area");
                    break;
            }
        }

        var words = Word().Matches(text).Select(m => m.Value).Where(w => w.Length > 2 && !QuestionWords.Contains(w)).Distinct().ToList();
        if (words.Count == 0)
            return;
        var found = await QueryAsync(tx, Search, new { index = CatalogLoader.SearchIndex, query = string.Join(' ', words) });
        if (found.Count == 0)
            return;
        var top = found.Max(f => f["score"].As<double>());
        foreach (var f in found)
        {
            var share = f["score"].As<double>() / top;
            if (share < 0.5)
                continue;
            var column = f["column"].As<string?>();
            add(f["table"].As<string>(), (column is null ? 2 : 1) * share * weight,
                column is null ? "its description matches" : $"column {column}'s description matches");
        }
    }

    async Task<List<JoinPath>> JoinPathsAsync(IAsyncQueryRunner tx, List<string> ids)
    {
        var pairs = ids.SelectMany((a, i) => ids.Skip(i + 1).Select(b => new List<string> { a, b })).ToList();
        if (pairs.Count == 0)
            return [];
        return (await QueryAsync(tx, JoinPaths, new { pairs })).Select(r => new JoinPath(
            r["from"].As<string>(), r["to"].As<string>(), r["steps"].As<List<object>>().Cast<Map>().Select(Join).ToList())).ToList();
    }

    async Task<List<TableDetail>> TablesAsync(IAsyncQueryRunner tx, bool all, List<string> ids, bool withDocumentation, bool brief) =>
        (await QueryAsync(tx, SelectTables, new { all, ids, withDocumentation })).Select(r =>
        {
            var t = r["table"].As<Map>();
            var columns = Maps(r["columns"]).OrderBy(c => Long(c, "ordinal")).Select(c => new ColumnInfo(
                Text(c, "name")!, Text(c, "dataType")!, Bool(c, "nullable"), Bool(c, "primaryKey"), Bool(c, "unique"), Bool(c, "identity"),
                Text(c, "computed"), Text(c, "defaultValue"), Text(c, "sensitivity"), Text(c, "meaning"), Text(c, "evidence"),
                Text(c, "references"))).ToList();
            // A join from a table to itself (a parent department) is found from both of its ends.
            var joins = Maps(r["joins"]).DistinctBy(j => Long(j, "position")).OrderBy(j => Long(j, "position")).Select(Join).ToList();
            var rules = Maps(r["rules"]).OrderBy(x => Long(x, "position")).Select(x => new RuleInfo(Text(x, "text")!, Text(x, "evidence"))).ToList();
            // In brief (every table at once), indexes, constraints and triggers are left out to keep the prompt small.
            var indexes = brief ? null : Maps(r["indexes"]).OrderBy(i => Long(i, "position")).Select(i => new IndexInfo(
                Text(i, "name")!, StringList(i, "columns"), StringList(i, "includedColumns"), Bool(i, "unique"), Bool(i, "clustered"),
                Text(i, "filterPredicate"))).ToList();
            var constraints = brief ? null : Maps(r["constraints"]).OrderBy(k => Long(k, "position")).Select(k => new ConstraintInfo(
                Text(k, "name")!, Text(k, "type")!, StringList(k, "columns"), Text(k, "definition"))).ToList();
            var triggers = brief ? null : Maps(r["triggers"]).Select(g => new TriggerInfo(
                Text(g, "name")!, StringList(g, "events"), Text(g, "timing"), Bool(g, "enabled"), Text(g, "summary"))).ToList();
            return new TableDetail(
                Text(t, "id")!, Text(t, "area"), Text(t, "purpose"), Text(t, "purposeEvidence"), Text(t, "recordMeaning"),
                t.TryGetValue("rowCount", out var rows) && rows is long n ? n : null, StringList(t, "primaryKey"), columns, joins,
                indexes, constraints, triggers, rules, r["documentation"].As<string?>());
        }).ToList();

    async Task<List<TableSummary>> SummariesAsync(IAsyncQueryRunner tx, bool all, List<string> ids) =>
        (await QueryAsync(tx, SelectSummaries, new { all, ids })).Select(r => new TableSummary(
            r["id"].As<string>(), r["area"].As<string?>(), r["purpose"].As<string?>(), r["rowCount"].As<long?>(),
            (int)r["columnCount"].As<long>())).ToList();

    static async Task<DatabaseInfo> DatabaseAsync(IAsyncQueryRunner tx)
    {
        var r = (await QueryAsync(tx, SelectDatabase, new { })).FirstOrDefault()
            ?? throw new CatalogException("Neo4j holds no catalog. Check the catalog folder and the last load (GET /catalog/status).");
        return new(r["name"].As<string>(), r["provider"].As<string>(), r["version"].As<string?>(), r["summary"].As<string?>());
    }

    async Task<T> ReadAsync<T>(Func<IAsyncQueryRunner, Task<T>> work, CancellationToken ct)
    {
        await using var session = driver.AsyncSession(c => c.WithDatabase(neo4j.Value.Database).WithDefaultAccessMode(AccessMode.Read));
        return await session.ExecuteReadAsync(tx => work(tx));
    }

    static async Task<List<IRecord>> QueryAsync(IAsyncQueryRunner tx, string cypher, object parameters) =>
        await (await tx.RunAsync(cypher, parameters)).ToListAsync();

    static JoinInfo Join(Map j) => new(
        Text(j, "name"), Text(j, "from")!, StringList(j, "fromColumns"), Text(j, "to")!, StringList(j, "toColumns"), Text(j, "cardinality"),
        Bool(j, "required"), Bool(j, "enforced"), Text(j, "evidence"), Text(j, "meaning"), Text(j, "condition") ?? "");

    static IEnumerable<Map> Maps(object value) => value.As<List<object>>().Cast<Map>();

    static List<string> Strings(object value) => value.As<List<object>>().Select(x => x.ToString()!).ToList();

    static string? Text(Map map, string key) => map.TryGetValue(key, out var value) && value is not null ? value.ToString() : null;

    static bool Bool(Map map, string key) => map.TryGetValue(key, out var value) && value is true;

    static long Long(Map map, string key) => map.TryGetValue(key, out var value) && value is long n ? n : 0;

    static List<string> StringList(Map map, string key) =>
        map.TryGetValue(key, out var value) && value is IEnumerable<object> list ? list.Select(x => x.ToString()!).ToList() : [];

    [GeneratedRegex("[A-Za-z0-9]+")]
    private static partial Regex Word();
}
