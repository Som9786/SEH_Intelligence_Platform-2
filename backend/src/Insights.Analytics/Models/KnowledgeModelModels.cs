namespace Insights.Analytics.Models;

/// The knowledge model, read from Neo4j: all of it (GET /schema), or the part one question is about (POST /context), which is
/// what the AI Hub puts in its prompt. Matched lists the concepts and metrics the question's words named, and is empty
/// when the whole knowledge model is returned. Coverage is the first and last business date in the data, or null when it
/// couldn't be read.
public sealed record KnowledgeModelContext(
    string Dialect, DataCoverage? Coverage, IReadOnlyList<string> Matched,
    IReadOnlyList<TableInfo> Tables, IReadOnlyList<ConceptInfo> Concepts, IReadOnlyList<RelationshipInfo> Relationships,
    IReadOnlyList<MetricInfo> Metrics, IReadOnlyList<string> Rules, IReadOnlyList<ExampleQuery> Examples);

public sealed record TableInfo(string Name, string Description, IReadOnlyList<ColumnInfo> Columns);

public sealed record ColumnInfo(string Name, string Type, string Description, IReadOnlyList<string>? Values);

public sealed record ConceptInfo(string Name, string Description, string Table, string Key, IReadOnlyList<AttributeInfo> Attributes);

public sealed record AttributeInfo(string Name, string Expression, string Description);

public sealed record RelationshipInfo(string Name, string From, string To, string Join);

public sealed record MetricInfo(string Name, string Description, string Expression);

/// A question with a SQL query checked as correct. Dialect is "SQL Server" for a SQL Server query, null for PostgreSQL.
public sealed record ExampleQuery(string Question, string Sql, string? Dialect = null);

/// The business dates the data covers, as yyyy-MM-dd.
public sealed record DataCoverage(string From, string To);

/// Body of POST /context. History holds the conversation's earlier questions, so a follow-up keeps their concepts.
public sealed record ContextRequest(string Question, IReadOnlyList<string>? History = null);

/// The last knowledge model load: when, how much it loaded, and the error when it failed (the graph then keeps the previous one).
public sealed record KnowledgeModelLoadStatus(DateTimeOffset At, bool Succeeded, string? Error, IReadOnlyDictionary<string, int> Counts);
