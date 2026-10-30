using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;

namespace Insights.AiHub.Services.Routing;

/// A service's own description of what it answers: its name and suggested questions.
public sealed record ServiceProfile(string Name, IReadOnlyList<string> Suggestions);

/// What Analytics (GET /dataset) and DB Guide (GET /guide) say they answer, used as examples when classifying a question,
/// so the routing follows their data and suggestions without a code change. Kept for a few minutes; a service that
/// doesn't answer is classified from the built-in description alone.
public sealed class ServiceProfiles(IHttpClientFactory httpClientFactory, ILogger<ServiceProfiles> logger)
{
    static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);
    static readonly TimeSpan RetryAfterFailure = TimeSpan.FromMinutes(1);

    readonly ConcurrentDictionary<string, (ServiceProfile? Profile, DateTimeOffset Until)> profiles = new();

    public Task<ServiceProfile?> AnalyticsAsync(CancellationToken ct) => GetAsync(RoutingClients.Analytics, "dataset", ct);

    public Task<ServiceProfile?> DbGuideAsync(CancellationToken ct) => GetAsync(RoutingClients.DbGuide, "guide", ct);

    async Task<ServiceProfile?> GetAsync(string client, string path, CancellationToken ct)
    {
        if (profiles.TryGetValue(client, out var known) && known.Until > DateTimeOffset.UtcNow)
            return known.Profile;
        ServiceProfile? profile = null;
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(5));
            profile = await httpClientFactory.CreateClient(client).GetFromJsonAsync<ServiceProfile>(path, JsonSerializerOptions.Web, timeout.Token);
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            logger.LogWarning("Routing: could not read GET /{Path} from {Client} ({Message}); classifying without its examples", path, client, e.Message);
        }
        profiles[client] = (profile, DateTimeOffset.UtcNow + (profile is null ? RetryAfterFailure : Lifetime));
        return profile;
    }
}
