namespace Insights.AiHub.Models;

/// Response of GET /health.
public sealed record HealthResponse(string Status, string Model, string Provider);
