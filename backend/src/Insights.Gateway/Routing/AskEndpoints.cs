using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Insights.Common;

namespace Insights.Gateway.Routing;

/// The services the gateway calls itself (not only passes requests on to): the HttpClient names, which are also the
/// ReverseProxy cluster ids their addresses come from.
public static class Services
{
    public const string Ai = "ai";
    public const string Analytics = "analytics";
    public const string DbCatalog = "db-catalog";
}

/// One question in, the answer from the service it's for. The AI Hub only makes the model calls (POST /intent, /follow-ups);
/// the gateway sends it what each service answers, and asks Analytics or DB Catalog itself, so no service calls back into
/// another one.
public static class AskEndpoints
{
    const string AnalyticsIntent = Intents.Analytics;
    const string DbCatalogIntent = Intents.DbCatalog;
    const string NoBoard = Boards.None;
    const string NoChart = Charts.None;

    public static IServiceCollection AddAsk(this IServiceCollection services, IConfiguration configuration)
    {
        // Each at the address its ReverseProxy cluster lists. An answer can take minutes: Analytics makes two model calls
        // and runs a query, so allow as long as the proxy does.
        foreach (var service in new[] { Services.Ai, Services.Analytics, Services.DbCatalog })
            services.AddHttpClient(service, http =>
            {
                http.BaseAddress = AddressOf(configuration, service);
                http.Timeout = TimeSpan.FromSeconds(configuration.GetValue("Gateway:AskTimeoutSeconds", 300));
            });
        services.AddSingleton<ServiceProfiles>();
        return services;
    }

    public static void MapAsk(this WebApplication app)
    {
        // The /api check in Program.cs has already refused anyone not signed in, and routes Gateway:Allow doesn't list.
        var group = app.MapGroup("/api/ai");

        group.MapPost("/intent", async (JsonObject body, IHttpClientFactory clients, ServiceProfiles profiles, CancellationToken ct) =>
            await PassOnAsync(clients, "intent", await WithProfilesAsync(body, profiles, ct), ct));

        group.MapPost("/follow-ups", async (JsonObject body, IHttpClientFactory clients, ServiceProfiles profiles, CancellationToken ct) =>
            await PassOnAsync(clients, "follow-ups", await WithProfilesAsync(body, profiles, ct), ct));

        // Question -> its intent (AI Hub), then the answer from the service for it (Analytics or DB Catalog POST /ask), passed
        // through in Result. An unclear question calls neither and says what to ask instead. When a service fails, its own
        // error response is passed on, with the intent in the X-Intent header.
        group.MapPost("/ask", async (RouteRequest request, HttpContext context, IHttpClientFactory clients, ServiceProfiles profiles,
            ILogger<ServiceProfiles> logger, CancellationToken ct) =>
        {
            if (QuestionRules.Problem(request.Question) is { } problem)
                return Results.Problem(problem, statusCode: StatusCodes.Status400BadRequest);

            var analyticsProfile = await profiles.AnalyticsAsync(ct);
            var dbCatalogProfile = await profiles.DbCatalogAsync(ct);
            using var classified = await SendAsync(clients, Services.Ai, "intent",
                new { request.Question, request.History, analytics = analyticsProfile, dbCatalog = dbCatalogProfile }, ct);
            if (classified.Failure is { } aiFailure)
                return aiFailure;
            var intent = classified.Json!.RootElement;
            var name = Text(intent, "intent");
            var reason = Text(intent, "reason");
            var usage = intent.TryGetProperty("usage", out var u) ? u.Clone() : (JsonElement?)null;
            var cached = intent.TryGetProperty("cached", out var c) && c.ValueKind == JsonValueKind.True;
            if (name is not (AnalyticsIntent or DbCatalogIntent))
                return Results.Ok(new RoutedAnswer(request.Question, Intents.Unclear, reason, NoBoard, null, null,
                    UnclearMessage(reason, analyticsProfile, dbCatalogProfile), usage, cached));

            context.Response.Headers["X-Intent"] = name;
            var analytics = name == AnalyticsIntent;
            var turns = request.History ?? [];
            // Each service gets only its own earlier turns, as its follow-up history.
            object body = analytics
                ? new
                {
                    question = request.Question,
                    history = turns.Where(t => t.Intent == AnalyticsIntent && !string.IsNullOrWhiteSpace(t.Sql))
                        .Select(t => new { question = t.Question, sql = t.Sql }),
                }
                : new
                {
                    question = request.Question,
                    history = turns.Where(t => t.Intent == DbCatalogIntent && !string.IsNullOrWhiteSpace(t.Answer))
                        .Select(t => new { question = t.Question, answer = t.Answer }),
                };
            var service = analytics ? Services.Analytics : Services.DbCatalog;
            logger.LogInformation("Routing: passing \"{Question}\" to {Service}", request.Question, service);
            using var answered = await SendAsync(clients, service, "ask", body, ct);
            if (answered.Failure is { } serviceFailure)
                return serviceFailure;
            // Only answers about the data go on a board, or are drawn as a chart.
            return Results.Ok(new RoutedAnswer(request.Question, name, reason, analytics ? Text(intent, "board", NoBoard) : NoBoard,
                name, answered.Json!.RootElement.Clone(), null, usage, cached, analytics ? Text(intent, "chart", NoChart) : NoChart));
        });
    }

    /// The request body with what each service answers added, for the AI Hub's prompt.
    static async Task<JsonObject> WithProfilesAsync(JsonObject body, ServiceProfiles profiles, CancellationToken ct)
    {
        body["analytics"] = JsonSerializer.SerializeToNode(await profiles.AnalyticsAsync(ct), JsonSerializerOptions.Web);
        body["dbCatalog"] = JsonSerializer.SerializeToNode(await profiles.DbCatalogAsync(ct), JsonSerializerOptions.Web);
        return body;
    }

    /// The AI Hub's response, as it is.
    static async Task<IResult> PassOnAsync(IHttpClientFactory clients, string path, JsonObject body, CancellationToken ct)
    {
        using var reply = await SendAsync(clients, Services.Ai, path, body, ct);
        return reply.Failure ?? Results.Content(reply.Text, "application/json");
    }

    /// A service's JSON reply, or the response to return instead: its own error, or 503/504 when it couldn't be reached in time.
    static async Task<Reply> SendAsync(IHttpClientFactory clients, string service, string path, object body, CancellationToken ct)
    {
        var http = clients.CreateClient(service);
        var label = service switch { Services.Ai => "AI Hub", Services.Analytics => "Analytics", _ => "DB Catalog" };
        try
        {
            using var response = await http.PostAsJsonAsync(path, body, JsonSerializerOptions.Web, ct);
            var text = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
                return new(text, null, Results.Content(text, response.Content.Headers.ContentType?.ToString() ?? "application/json",
                    statusCode: (int)response.StatusCode));
            return new(text, JsonDocument.Parse(text), null);
        }
        catch (HttpRequestException e)
        {
            return new("", null, Results.Problem($"{label} is not reachable at {http.BaseAddress}: {e.Message}",
                title: $"{label} unavailable", statusCode: StatusCodes.Status503ServiceUnavailable));
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return new("", null, Results.Problem($"{label} did not answer in time (Gateway:AskTimeoutSeconds).",
                title: $"{label} timeout", statusCode: StatusCodes.Status504GatewayTimeout));
        }
    }

    /// The reason, then one example question for each service.
    static string UnclearMessage(string reason, ServiceProfile? analytics, ServiceProfile? dbCatalog)
    {
        var data = analytics?.Suggestions.FirstOrDefault();
        var structure = dbCatalog?.Suggestions.FirstOrDefault();
        var examples = data is null || structure is null
            ? "I can answer questions about the sales data, or about the database's tables, columns and joins."
            : $"I can answer questions about the sales data, such as \"{data}\", or about the database's structure, such as \"{structure}\".";
        return $"{reason} {examples}";
    }

    static string Text(JsonElement json, string property, string fallback = "") =>
        json.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? fallback : fallback;

    /// The first destination address of a ReverseProxy cluster, so each service is configured in one place.
    static Uri AddressOf(IConfiguration configuration, string cluster) =>
        configuration.GetSection($"ReverseProxy:Clusters:{cluster}:Destinations").GetChildren()
            .Select(d => d["Address"]).FirstOrDefault(a => !string.IsNullOrWhiteSpace(a)) is { } address
            ? new Uri(address.TrimEnd('/') + "/")
            : throw new InvalidOperationException($"ReverseProxy:Clusters:{cluster} has no destination address in the gateway's appsettings.json.");

    sealed record Reply(string Text, JsonDocument? Json, IResult? Failure) : IDisposable
    {
        public void Dispose() => Json?.Dispose();
    }
}

/// Response of POST /api/ai/ask. Service is the service that answered ("analytics" or "db-catalog") and Result its own POST
/// /ask response, passed through as it is. For an unclear question both are null and Message says what to ask instead.
/// Board is the capability board the answer can be added to, and Chart the chart the question asks for ("none" unless it
/// is about the data). IntentUsage and IntentCached are the AI Hub's classifying call.
public sealed record RoutedAnswer(
    string Question, string Intent, string Reason, string Board, string? Service, JsonElement? Result, string? Message,
    JsonElement? IntentUsage, bool IntentCached, string Chart = "none");
