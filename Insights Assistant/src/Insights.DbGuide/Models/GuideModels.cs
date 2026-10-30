using System.Text.Json;

namespace Insights.DbGuide.Models;

/// The database the catalog describes.
public sealed record DatabaseInfo(string Name, string Provider, string? Version, string? Summary);

/// GET /catalog: the whole catalog at a glance, for the page's catalog browser and join diagram.
public sealed record CatalogOverview(
    DatabaseInfo Database, IReadOnlyDictionary<string, int> Counts, IReadOnlyList<AreaInfo> Areas,
    IReadOnlyList<TableSummary> Tables, IReadOnlyList<JoinInfo> Joins);

public sealed record AreaInfo(string Name, string? Purpose, IReadOnlyList<string> Tables);

public sealed record TableSummary(string Id, string? Area, string? Purpose, long? RowCount, int ColumnCount);

/// A link between two tables and how to join them. From is the table holding the referencing columns. On is the join
/// condition in SQL; Enforced is false for links the database doesn't check with a foreign key (Evidence then says inferred).
public sealed record JoinInfo(
    string? Name, string From, IReadOnlyList<string> FromColumns, string To, IReadOnlyList<string> ToColumns, string? Cardinality,
    bool Required, bool Enforced, string? Evidence, string? Meaning, string On);

/// One table with everything the catalog says about it. Documentation (the export's Markdown page) is only filled for
/// GET /catalog/tables/{id}; the AI gets the structured fields instead.
public sealed record TableDetail(
    string Id, string? Area, string? Purpose, string? PurposeEvidence, string? RecordMeaning, long? RowCount,
    IReadOnlyList<string> PrimaryKey, IReadOnlyList<ColumnInfo> Columns, IReadOnlyList<JoinInfo> Joins,
    IReadOnlyList<IndexInfo>? Indexes, IReadOnlyList<ConstraintInfo>? Constraints, IReadOnlyList<TriggerInfo>? Triggers,
    IReadOnlyList<RuleInfo> Rules, string? Documentation = null);

/// References is the column it points to ("schema.Table.Column"), by foreign key or inferred link.
public sealed record ColumnInfo(
    string Name, string DataType, bool Nullable, bool PrimaryKey, bool Unique, bool Identity, string? Computed, string? Default,
    string? Sensitivity, string? Meaning, string? Evidence, string? References);

public sealed record IndexInfo(string Name, IReadOnlyList<string> Columns, IReadOnlyList<string> IncludedColumns, bool Unique, bool Clustered, string? Filter);

public sealed record ConstraintInfo(string Name, string Type, IReadOnlyList<string> Columns, string? Definition);

public sealed record TriggerInfo(string Name, IReadOnlyList<string> Events, string? Timing, bool Enabled, string? Summary);

public sealed record RuleInfo(string Text, string? Evidence);

/// POST /context: the part of the catalog a question is about, which is what the AI gets. Matched says which tables the
/// question's words pointed at and why; JoinPaths is the shortest chain of joins between each pair of them. With nothing
/// matched, All is true and Tables holds every table without indexes, constraints and triggers.
public sealed record GuideContext(
    DatabaseInfo Database, bool All, IReadOnlyList<MatchInfo> Matched, IReadOnlyList<TableDetail> Tables,
    IReadOnlyList<JoinPath> JoinPaths, IReadOnlyList<TableSummary> OtherTables);

public sealed record MatchInfo(string Table, string Why);

public sealed record JoinPath(string From, string To, IReadOnlyList<JoinInfo> Steps);

/// Body of POST /context and POST /ask. History holds earlier questions in the conversation and their answers, oldest
/// first, so a follow-up such as "and its supplier?" keeps the tables the conversation is about.
public sealed record AskRequest(string Question, IReadOnlyList<GuideTurn>? History = null);

public sealed record GuideTurn(string Question, string Answer);

/// Response of POST /ask. Answer is Markdown; Sql is an example query (never run), or empty. Tables are the ones the
/// answer uses; Given are the tables the AI was given. Usage is the AI Hub's token and cost count, passed through.
public sealed record AskResponse(
    string Question, string Answer, IReadOnlyList<string> Tables, string Sql, IReadOnlyList<MatchInfo> Matched,
    IReadOnlyList<string> Given, IReadOnlyList<JoinPath> JoinPaths, JsonElement? Usage, bool Cached);

/// The last catalog load: when, how much it loaded, and the error when it failed (the graph then keeps the previous one).
public sealed record CatalogLoadStatus(DateTimeOffset At, bool Succeeded, string? Error, IReadOnlyDictionary<string, int> Counts);

/// GET /health: whether the catalog is loaded in Neo4j and the AI Hub answers.
public sealed record HealthResponse(ComponentHealth Catalog, ComponentHealth Ai, string? Model);

public sealed record ComponentHealth(bool Ok, string Detail);

/// GET /guide: the page's name and suggested questions.
public sealed record GuideInfo(string Name, IReadOnlyList<string> Suggestions);
