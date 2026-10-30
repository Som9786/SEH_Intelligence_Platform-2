using System.Net;
using System.Text.Json;

namespace Insights.DbGuide.Services.AiHub;

/// The AI Hub answered with an error. Carries its status, title and detail so they reach the caller unchanged.
public sealed class AiHubException(int statusCode, string title, string detail) : Exception(detail)
{
    public int StatusCode { get; } = statusCode;
    public string Title { get; } = title;

    /// Keeps the AI Hub's own problem title and detail when it sent them.
    public static AiHubException FromResponse(HttpStatusCode status, string body)
    {
        string? title = null, detail = null;
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind == JsonValueKind.Object)
            {
                title = doc.RootElement.TryGetProperty("title", out var t) ? t.GetString() : null;
                detail = doc.RootElement.TryGetProperty("detail", out var d) ? d.GetString() : null;
            }
        }
        catch (JsonException)
        {
        }
        return new((int)status, title ?? "AI Hub error", detail ?? (body.Length > 0 ? body : $"HTTP {(int)status}"));
    }
}
