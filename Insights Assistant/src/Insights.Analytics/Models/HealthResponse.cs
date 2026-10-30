namespace Insights.Analytics.Models;

/// Response of GET /health: whether Neo4j holds a loaded knowledge model, and whether the data's database answers, with the business
/// dates it covers.
public sealed record HealthResponse(ComponentHealth KnowledgeModel, ComponentHealth Data, DataCoverage? Coverage);

public sealed record ComponentHealth(bool Ok, string Detail);
