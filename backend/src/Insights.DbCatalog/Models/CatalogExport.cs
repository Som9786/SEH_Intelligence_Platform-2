namespace Insights.DbCatalog.Models;

// The catalog export's own JSON files, read as they are. Text with an "evidence" says whether it was confirmed (from the
// database's stored descriptions or structure) or inferred (from names, values and documentation).

/// database.json.
public sealed record DatabaseFile(DatabaseEntry Database, Dictionary<string, int>? Counts, List<DocumentEntry>? Documents);

/// A Markdown page of the export; Table is set for a table's own page.
public sealed record DocumentEntry(string Id, string? Title, string Path, string? Table);

public sealed record DatabaseEntry(string Name, string Provider, string? ProductVersion, string? Collation, EvidenceText? Summary);

public sealed record EvidenceText(string Text, string? Evidence);

/// business-areas.json.
public sealed record BusinessAreasFile(List<BusinessAreaEntry> BusinessAreas);

public sealed record BusinessAreaEntry(string Name, string? Purpose, string? Evidence, List<string> Tables);

/// relationships.json: every link between tables, enforced by a foreign key or inferred.
public sealed record RelationshipsFile(List<RelationshipEntry> Relationships);

public sealed record RelationshipEntry(
    string? Name, RelationshipEnd From, RelationshipEnd To, string? Cardinality, bool FromRequired, string? OnDelete, string? OnUpdate,
    bool Enforced, string? Evidence, string? Meaning);

public sealed record RelationshipEnd(string Table, List<string> Columns);

/// tables/*.json: one table's structure and meaning.
public sealed record TableFile(
    string Id, string Schema, string Name, string? BusinessArea, EvidenceText? Purpose, EvidenceText? RecordMeaning,
    long? RowCount, bool RowCountExact, List<string>? PrimaryKey, List<ColumnEntry> Columns,
    List<IndexEntry>? Indexes, List<ConstraintEntry>? Constraints, List<TriggerEntry>? Triggers, List<EvidenceText>? BusinessRules);

public sealed record ColumnEntry(
    int Ordinal, string Name, string DataType, bool Nullable, bool PrimaryKey, ForeignKeyEntry? ForeignKey, bool Unique, bool Identity,
    string? Computed, string? Default, string? Sensitivity, EvidenceText? Meaning);

public sealed record ForeignKeyEntry(string Table, string Column);

public sealed record IndexEntry(string Name, List<string> Columns, List<string>? IncludedColumns, bool Unique, bool Clustered, string? Filter);

public sealed record ConstraintEntry(string Name, string Type, List<string>? Columns, string? Definition, bool Enforced);

public sealed record TriggerEntry(string Name, List<string>? Events, string? Timing, bool Enabled, string? Summary);
