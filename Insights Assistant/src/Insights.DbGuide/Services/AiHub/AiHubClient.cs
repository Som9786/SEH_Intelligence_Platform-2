using System.Text.Json;
using System.Text.Json.Serialization;
using Insights.Common.AiHub;
using Insights.DbGuide.Models;

namespace Insights.DbGuide.Services.AiHub;

/// The AI Hub's reply to POST /guide: the answer in Markdown, the tables it uses, and an example query (or empty).
public sealed record GuideReply(string Answer, IReadOnlyList<string> Tables, string Sql, JsonElement? Usage, bool Cached);

/// The AI Hub's GET /health.
public sealed record AiHealth(string Status, string Model);

/// The AI Hub endpoints DB Guide uses. Each call waits for the AI Hub's response; errors become AiHubException.
public sealed class AiHubClient(AiHubConnection aiHub)
{
    // Empty fields are left out, which keeps the catalog context in the prompt small.
    static readonly JsonSerializerOptions RequestJson = new(JsonSerializerOptions.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    /// The question with its part of the catalog -> an answer. The AI Hub never reads the catalog itself.
    public Task<GuideReply> GuideAsync(string question, GuideContext context, IReadOnlyList<GuideTurn> history, CancellationToken ct) =>
        aiHub.SendAsync<GuideReply>(HttpMethod.Post, "guide", new { question, context, history }, ct, requestJson: RequestJson);

    /// Not logged when it succeeds, since the page checks it every 30 seconds.
    public Task<AiHealth> HealthAsync(CancellationToken ct) => aiHub.SendAsync<AiHealth>(HttpMethod.Get, "health", null, ct, log: false);

    /// The AI Hub's running model token and cost totals, passed through.
    public Task<string> GetUsageAsync(CancellationToken ct) => aiHub.SendAsync(HttpMethod.Get, "usage", null, ct, log: false);
}
