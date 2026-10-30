using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;

namespace Insights.Gateway.Routing;

/// What Analytics (GET /dataset) and DB Catalog (GET /guide) say they answer, sent with every intent and follow-up request so
/// the AI Hub's routing follows their data and suggestions without a code change, and without the AI Hub calling them.
/// Kept for a few minutes; a service that doesn't answer is left out, and the AI Hub uses its built-in description.
public sealed class ServiceProfiles(IHttpClientFactory httpClientFactory, ILogger<ServiceProfiles> logger)
{
    static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);
    static readonly TimeSpan RetryAfterFailure = TimeSpan.FromMinutes(1);

    readonly ConcurrentDictionary<string, (ServiceProfile? Profile, DateTimeOffset Until)> profiles = new();

    public Task<ServiceProfile?> AnalyticsAsync(CancellationToken ct) => GetAsync(Services.Analytics, "dataset", ct);

    public Task<ServiceProfile?> DbCatalogAsync(CancellationToken ct) => GetAsync(Services.DbCatalog, "guide", ct);

    async Task<ServiceProfile?> GetAsync(string service, string path, CancellationToken ct)
    {
        if (profiles.TryGetValue(service, out var known) && known.Until > DateTimeOffset.UtcNow)
            return known.Profile;
        ServiceProfile? profile = null;
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(5));
            profile = await httpClientFactory.CreateClient(service).GetFromJsonAsync<ServiceProfile>(path, JsonSerializerOptions.Web, timeout.Token);
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            logger.LogWarning("Routing: could not read GET /{Path} from {Service} ({Message}); classifying without its examples", path, service, e.Message);
        }
        profiles[service] = (profile, DateTimeOffset.UtcNow + (profile is null ? RetryAfterFailure : Lifetime));
        return profile;
    }
}
