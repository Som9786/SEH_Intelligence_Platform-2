using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;

namespace Insights.AiHub.Services.KnowledgeModel;

/// Gets the part of the knowledge model a question is about from the analytics service (POST /context), which reads it
/// from Neo4j. Fetched for every question, since which concepts, rules and examples are relevant depends on the question;
/// building it takes a few milliseconds.
public sealed class KnowledgeModelClient(IHttpClientFactory httpClientFactory, ILogger<KnowledgeModelClient> logger)
{
    /// Name of the HttpClient configured with Analytics:BaseUrl.
    public const string HttpClientName = "Analytics";

    static readonly JsonSerializerOptions Indented = new() { WriteIndented = true };

    /// The context as indented JSON for the prompt. History is the conversation's earlier questions.
    public async Task<string> GetContextAsync(string question, IReadOnlyList<string> history, CancellationToken ct)
    {
        var http = httpClientFactory.CreateClient(HttpClientName);
        logger.LogInformation("Knowledge model: asking the analytics service at {BaseUrl}context for this question's context", http.BaseAddress);
        var timer = Stopwatch.StartNew();
        using var response = await http.PostAsJsonAsync("context", new { question, history }, JsonSerializerOptions.Web, ct);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(
                $"POST /context answered {(int)response.StatusCode}: {Detail(await response.Content.ReadAsStringAsync(ct))}", null, response.StatusCode);
        var context = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        var json = JsonSerializer.Serialize(context, Indented);
        logger.LogInformation("Knowledge model: got {Chars} characters of context ({Concepts}) in {Ms} ms",
            json.Length, string.Join(", ", Names(context)), timer.ElapsedMilliseconds);
        return json;
    }

    /// The concepts and metrics in a context, to show which part of the knowledge model answered a question.
    public static IReadOnlyList<string> Names(string contextJson)
    {
        using var doc = JsonDocument.Parse(contextJson);
        return Names(doc.RootElement);
    }

    static List<string> Names(JsonElement context) =>
        new[] { "concepts", "metrics" }
            .Where(p => context.TryGetProperty(p, out var list) && list.ValueKind == JsonValueKind.Array)
            .SelectMany(p => context.GetProperty(p).EnumerateArray())
            .Select(e => e.TryGetProperty("name", out var n) ? n.GetString() : null)
            .OfType<string>()
            .ToList();

    /// The problem response's detail, or the body itself.
    static string Detail(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("detail", out var d))
                return d.GetString() ?? body;
        }
        catch (JsonException)
        {
        }
        return body.Length > 300 ? body[..300] + "…" : body;
    }
}
