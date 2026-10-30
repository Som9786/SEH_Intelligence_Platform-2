using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using Insights.Analytics.Models;

namespace Insights.Analytics.Services.AiHub;

/// Calls the AI Hub's endpoints and waits for each response. Errors it returns become AiHubException.
public sealed class AiHubClient(IHttpClientFactory httpClientFactory, ILogger<AiHubClient> logger)
{
    /// Name of the HttpClient configured with AiHub:BaseUrl and AiHub:TimeoutSeconds.
    public const string HttpClientName = "AiHub";

    public Task<SqlResponse> GenerateSqlAsync(SqlRequest request, CancellationToken ct) =>
        SendAsync<SqlResponse>(HttpMethod.Post, "sql", request, ct);

    public Task<AnswerResponse> AnswerAsync(AnswerRequest request, CancellationToken ct) =>
        SendAsync<AnswerResponse>(HttpMethod.Post, "answer", request, ct);

    /// Not logged when it succeeds, since the page checks it every 30 seconds.
    public Task<AiHealthResponse> HealthAsync(CancellationToken ct) =>
        SendAsync<AiHealthResponse>(HttpMethod.Get, "health", null, ct, log: false);

    /// The AI Hub's running OpenAI token and cost totals. Not logged, since the page checks it with the health check.
    public Task<string> GetUsageAsync(CancellationToken ct) => SendRawAsync(HttpMethod.Get, "usage", null, ct, log: false);

    /// The AI Hub's own debug log entries after `after`. Not logged itself, since the page polls it.
    public Task<string> GetLogsAsync(long after, CancellationToken ct) => SendRawAsync(HttpMethod.Get, $"logs?after={after}", null, ct, log: false);

    public Task<string> ClearLogsAsync(CancellationToken ct) => SendRawAsync(HttpMethod.Delete, "logs", null, ct, log: false);

    async Task<T> SendAsync<T>(HttpMethod method, string path, object? body, CancellationToken ct, bool log = true) =>
        JsonSerializer.Deserialize<T>(await SendRawAsync(method, path, body, ct, log), JsonSerializerOptions.Web)
        ?? throw new AiHubException(StatusCodes.Status502BadGateway, "AI Hub error", $"Empty response from /{path}.");

    async Task<string> SendRawAsync(HttpMethod method, string path, object? body, CancellationToken ct, bool log = true)
    {
        var http = httpClientFactory.CreateClient(HttpClientName);
        using var request = new HttpRequestMessage(method, path)
        {
            Content = body is null ? null : JsonContent.Create(body, body.GetType(), options: JsonSerializerOptions.Web),
        };
        if (log)
            logger.LogInformation("Calling AI Hub: {Method} {BaseUrl}{Path}", method, http.BaseAddress, path);
        var timer = Stopwatch.StartNew();
        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, ct);
        }
        catch (Exception e) when (log && e is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning("AI Hub {Method} /{Path} failed after {Ms} ms: {Message}", method, path, timer.ElapsedMilliseconds, e.Message);
            throw;
        }
        using (response)
        {
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
}
