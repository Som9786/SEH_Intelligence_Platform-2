using Insights.Contracts;
using System.Text.Json;
using System.Text.Json.Serialization;
using Insights.Common.AiHub;
using Insights.DbCatalog.Models;

namespace Insights.DbCatalog.Services.AiHub;

/// The AI Hub endpoints DB Catalog uses. Each call waits for the AI Hub's response; errors become AiHubException.
public sealed class AiHubClient(AiHubConnection aiHub)
{
    // Empty fields are left out, which keeps the catalog context in the prompt small.
    static readonly JsonSerializerOptions RequestJson = new(JsonSerializerOptions.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    /// The question with its part of the catalog -> an answer. The AI Hub never reads the catalog itself.
    public Task<GuideResponse> GuideAsync(string question, GuideContext context, IReadOnlyList<GuideTurn> history, CancellationToken ct) =>
        aiHub.SendAsync<GuideResponse>(HttpMethod.Post, "guide", new { question, context, history }, ct, requestJson: RequestJson);

    /// Not logged when it succeeds, since the page checks it every 30 seconds.
    public Task<AiHealthResponse> HealthAsync(CancellationToken ct) => aiHub.SendAsync<AiHealthResponse>(HttpMethod.Get, "health", null, ct, log: false);

    /// The AI Hub's running model token and cost totals, passed through.
    public Task<string> GetUsageAsync(CancellationToken ct) => aiHub.SendAsync(HttpMethod.Get, "usage", null, ct, log: false);
}
