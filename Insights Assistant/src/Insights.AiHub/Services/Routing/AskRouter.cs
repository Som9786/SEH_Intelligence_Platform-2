using System.Net.Http.Json;
using System.Text.Json;
using Insights.AiHub.Models;

namespace Insights.AiHub.Services.Routing;

/// Names of the HttpClients POST /ask passes questions on with (Analytics:BaseUrl and Routing:DbGuideBaseUrl).
public static class RoutingClients
{
    public const string Analytics = "Routing.Analytics";
    public const string DbGuide = "Routing.DbGuide";
}

/// What the answering service sent back: its status, content type and body, passed on as they are.
public sealed record ServiceReply(string Service, int Status, string ContentType, string Body);

/// Passes a classified question on to the service for its intent (POST /ask on Analytics or DB Guide), with that service's
/// own earlier turns as its history.
public sealed class AskRouter(IHttpClientFactory httpClientFactory, ILogger<AskRouter> logger)
{
    public async Task<ServiceReply> AskAsync(string intent, RouteRequest request, CancellationToken ct)
    {
        var turns = request.History ?? [];
        var (client, body) = intent == Intents.Analytics
            ? (RoutingClients.Analytics, (object)new
            {
                question = request.Question,
                history = turns.Where(t => t.Intent == Intents.Analytics && !string.IsNullOrWhiteSpace(t.Sql))
                    .Select(t => new { question = t.Question, sql = t.Sql }),
            })
            : (RoutingClients.DbGuide, new
            {
                question = request.Question,
                history = turns.Where(t => t.Intent == Intents.DbGuide && !string.IsNullOrWhiteSpace(t.Answer))
                    .Select(t => new { question = t.Question, answer = t.Answer }),
            });

        var http = httpClientFactory.CreateClient(client);
        logger.LogInformation("Routing: passing \"{Question}\" to {Service} at {BaseUrl}ask", request.Question, intent, http.BaseAddress);
        using var response = await http.PostAsJsonAsync("ask", body, JsonSerializerOptions.Web, ct);
        var text = await response.Content.ReadAsStringAsync(ct);
        logger.LogInformation("Routing: {Service} answered {Status}", intent, (int)response.StatusCode);
        return new ServiceReply(intent, (int)response.StatusCode,
            response.Content.Headers.ContentType?.ToString() ?? "application/json", text);
    }

    /// The base address a service is called at, for messages.
    public string AddressOf(string intent) =>
        httpClientFactory.CreateClient(intent == Intents.Analytics ? RoutingClients.Analytics : RoutingClients.DbGuide).BaseAddress?.ToString() ?? "";
}
