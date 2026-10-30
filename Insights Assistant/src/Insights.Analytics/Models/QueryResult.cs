namespace Insights.Analytics.Models;

/// Response of POST /query. Truncated is true when the query returned more than Query:MaxRows rows.
public sealed record QueryResult(IReadOnlyList<string> Columns, IReadOnlyList<Dictionary<string, object?>> Rows, bool Truncated);
