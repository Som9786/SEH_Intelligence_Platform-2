using Insights.Analytics.Models;
using Insights.Analytics.Services.KnowledgeModel;
using Insights.Common.AiHub;
using Insights.Contracts;
using System.Text.Json;

namespace Insights.Analytics.Services.AiHub;

/// The AI Hub endpoints Analytics uses. Each call waits for the AI Hub's response; errors become AiHubException.
public sealed class AiHubClient(AiHubConnection aiHub, KnowledgeModelReader knowledgeModel)
{
    /// Sends the question with its part of the knowledge model, read from Neo4j here: the AI Hub never calls back for it.
    /// The earlier questions keep a follow-up's concepts in the context.
    public async Task<SqlResponse> GenerateSqlAsync(SqlRequest request, CancellationToken ct)
    {
        var earlier = request.History?.Select(h => h.Question).ToList() ?? [];
        var context = await knowledgeModel.GetContextAsync(new ContextRequest(request.Question, earlier), ct);
        return await aiHub.SendAsync<SqlResponse>(HttpMethod.Post, "sql",
            request with { Context = JsonSerializer.SerializeToElement(context, JsonSerializerOptions.Web) }, ct);
    }

    public Task<AnswerResponse> AnswerAsync(AnswerRequest request, CancellationToken ct) =>
        aiHub.SendAsync<AnswerResponse>(HttpMethod.Post, "answer", request, ct);

    public Task<RecommendationResponse> RecommendAsync(RecommendationRequest request, CancellationToken ct) =>
        aiHub.SendAsync<RecommendationResponse>(HttpMethod.Post, "recommendations", request, ct);

    /// Not logged when it succeeds, since the page checks it every 30 seconds.
    public Task<AiHealthResponse> HealthAsync(CancellationToken ct) =>
        aiHub.SendAsync<AiHealthResponse>(HttpMethod.Get, "health", null, ct, log: false);

    /// The AI Hub's running model token and cost totals. Not logged, since the page checks it with the health check.
    public Task<string> GetUsageAsync(CancellationToken ct) => aiHub.SendAsync(HttpMethod.Get, "usage", null, ct, log: false);

    /// The AI Hub's own debug log entries after `after`. Not logged itself, since the page polls it.
    public Task<string> GetLogsAsync(long after, CancellationToken ct) => aiHub.SendAsync(HttpMethod.Get, $"logs?after={after}", null, ct, log: false);

    public Task<string> ClearLogsAsync(CancellationToken ct) => aiHub.SendAsync(HttpMethod.Delete, "logs", null, ct, log: false);
}
