using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Insights.DbGuide.Models;

namespace Insights.DbGuide.Services.AiHub;

/// The AI Hub's reply to POST /guide: the answer in Markdown, the tables it uses, and an example query (or empty).
public sealed record GuideReply(string Answer, IReadOnlyList<string> Tables, string Sql, JsonElement? Usage, bool Cached);

/// The AI Hub's GET /health.
public sealed record AiHealth(string Status, string Model);

/// Calls the AI Hub and waits for each response. Errors it returns become AiHubException.
public sealed class AiHubClient(IHttpClientFactory httpClientFactory, ILogger<AiHubClient> logger)
{
    /// Name of the HttpClient configured with AiHub:BaseUrl and AiHub:TimeoutSeconds.
    public const string HttpClientName = "AiHub";

    // Empty fields are left out, which keeps the catalog context in the prompt small.
    static readonly JsonSerializerOptions RequestJson = new(JsonSerializerOptions.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    /// The question with its part of the catalog -> an answer. The AI Hub never reads the catalog itself.
    public async Task<GuideReply> GuideAsync(string question, GuideContext context, IReadOnlyList<GuideTurn> history, CancellationToken ct) =>
        Parse<GuideReply>(await SendAsync(HttpMethod.Post, "guide", new { question, context, history }, ct), "guide");

    /// Not logged when it succeeds, since the page checks it every 30 seconds.
    public async Task<AiHealth> HealthAsync(CancellationToken ct) =>
        Parse<AiHealth>(await SendAsync(HttpMethod.Get, "health", null, ct, log: false), "health");

    /// The AI Hub's running OpenAI token and cost totals, passed through.
    public Task<string> GetUsageAsync(CancellationToken ct) => SendAsync(HttpMethod.Get, "usage", null, ct, log: false);

    static T Parse<T>(string json, string path) =>
        JsonSerializer.Deserialize<T>(json, JsonSerializerOptions.Web)
        ?? throw new AiHubException(StatusCodes.Status502BadGateway, "AI Hub error", $"Empty response from /{path}.");

    async Task<string> SendAsync(HttpMethod method, string path, object? body, CancellationToken ct, bool log = true)
    {
        var http = httpClientFactory.CreateClient(HttpClientName);
        using var request = new HttpRequestMessage(method, path)
        {
            Content = body is null ? null : JsonContent.Create(body, body.GetType(), options: RequestJson),
        };
        if (log)
            logger.LogInformation("Calling AI Hub: {Method} {BaseUrl}{Path}", method, http.BaseAddress, path);
        var timer = Stopwatch.StartNew();
        using var response = await http.SendAsync(request, ct);
        var text = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            if (log)
                logger.LogWarning("AI Hub {Method} /{Path} answered {Status} in {Ms} ms: {Body}",
                    method, path, (int)response.StatusCode, timer.ElapsedMilliseconds, text.Length > 300 ? text[..300] + "…" : text);
            throw AiHubException.FromResponse(response.StatusCode, text);
        }
        if (log)
            logger.LogInformation("AI Hub {Method} /{Path} answered {Status} in {Ms} ms ({Chars} characters)",
                method, path, (int)response.StatusCode, timer.ElapsedMilliseconds, text.Length);
        return text;
    }
}
