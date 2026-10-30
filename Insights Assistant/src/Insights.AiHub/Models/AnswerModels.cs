using System.Text.Json;

namespace Insights.AiHub.Models;

/// Body of POST /answer. Results is the analytics service's /query response, passed through as raw JSON.
public sealed record AnswerRequest(string Question, string? Sql, JsonElement Results);

/// Response of POST /answer. Usage is the tokens and cost of the model call; null with Cached = true when the same
/// question, query and results were answered before.
public sealed record AnswerResponse(string Answer, LlmUsage? Usage, bool Cached = false);
