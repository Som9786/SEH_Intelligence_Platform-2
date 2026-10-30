namespace Insights.Analytics.Services.KnowledgeModel;

/// knowledge-model.json, business-rules.json or query-examples.json doesn't describe a consistent knowledge model, e.g. a concept in a
/// table that isn't listed. The message names every problem found.
public sealed class KnowledgeModelException(string message) : Exception(message);
