namespace Insights.Contracts;

/// Tokens and cost of one model call (OpenAI or Bedrock). CostUsd is null when the AI Hub has no price for the model.
/// InputTokens includes CachedInputTokens, and OutputTokens includes ReasoningTokens.
public sealed record LlmUsage(string Model, int InputTokens, int CachedInputTokens, int OutputTokens, int ReasoningTokens, decimal? CostUsd);

/// Response of the AI Hub's GET /health: liveness, the model in use and its provider ("OpenAI" or "Bedrock").
public sealed record AiHealthResponse(string Status, string Model, string? Provider = null);
