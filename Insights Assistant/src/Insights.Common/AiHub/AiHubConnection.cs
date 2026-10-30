using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Insights.Common.AiHub;

/// Sends one request to the AI Hub (AiHub:BaseUrl, AiHub:TimeoutSeconds) and waits for its response, logging the call.
/// Each service's own AiHubClient builds on this with the endpoints it uses. Errors the AI Hub returns become AiHubException.
public sealed class AiHubConnection(IHttpClientFactory httpClientFactory, ILogger<AiHubConnection> logger)
{
    /// Name of the HttpClient configured with AiHub:BaseUrl and AiHub:TimeoutSeconds.
    public const string HttpClientName = "AiHub";

    /// The response body. Set log to false for calls a page polls, so they don't fill the log.
    public async Task<string> SendAsync(HttpMethod method, string path, object? body, CancellationToken ct, bool log = true,
        JsonSerializerOptions? requestJson = null)
    {
        var http = httpClientFactory.CreateClient(HttpClientName);
        using var request = new HttpRequestMessage(method, path)
        {
            Content = body is null ? null : JsonContent.Create(body, body.GetType(), options: requestJson ?? JsonSerializerOptions.Web),
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

    /// The response body read as T.
    public async Task<T> SendAsync<T>(HttpMethod method, string path, object? body, CancellationToken ct, bool log = true,
        JsonSerializerOptions? requestJson = null) =>
        JsonSerializer.Deserialize<T>(await SendAsync(method, path, body, ct, log, requestJson), JsonSerializerOptions.Web)
        ?? throw new AiHubException(StatusCodes.Status502BadGateway, "AI Hub error", $"Empty response from /{path}.");
}

public static class AiHubConnectionExtensions
{
    /// Registers AiHubOptions (the AiHub section), the HttpClient they configure, and AiHubConnection.
    public static IServiceCollection AddAiHubConnection(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<AiHubOptions>(configuration.GetSection(AiHubOptions.SectionName));
        services.AddHttpClient(AiHubConnection.HttpClientName, (sp, http) =>
        {
            var o = sp.GetRequiredService<IOptions<AiHubOptions>>().Value;
            http.BaseAddress = new Uri(o.BaseUrl.TrimEnd('/') + "/");
            http.Timeout = TimeSpan.FromSeconds(o.TimeoutSeconds);
        });
        services.AddSingleton<AiHubConnection>();
        return services;
    }
}
