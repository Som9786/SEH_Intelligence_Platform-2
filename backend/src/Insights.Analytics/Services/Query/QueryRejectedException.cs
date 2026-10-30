namespace Insights.Analytics.Services.Query;

/// Thrown when a /query request is refused before or instead of running, e.g. because it could write.
public sealed class QueryRejectedException(string message) : Exception(message);
