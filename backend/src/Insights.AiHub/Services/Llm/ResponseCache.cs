using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Insights.AiHub.Configuration;
using Microsoft.Extensions.Options;

namespace Insights.AiHub.Services.Llm;

/// Remembers model replies by a key built from everything that went into them, so asking the same thing again doesn't
/// call OpenAI. Callers put whatever can change the reply in the key (such as the knowledge model context), so stale entries are
/// never hit and simply age out; the oldest go first once Cache:MaxEntries is reached.
public sealed partial class ResponseCache<T>(IOptionsMonitor<CacheOptions> options) where T : class
{
    readonly ConcurrentDictionary<string, (T Value, long Order)> entries = new();
    long order;

    /// A fixed-length key for inputs of any length, such as query results.
    public static string KeyOf(params object?[] parts) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join('\u001f', parts))));

    /// "Which 5 stores?" and "which 5 stores" are the same question.
    public static string Normalize(string question) =>
        Spaces().Replace(question.Trim().TrimEnd('?', '.', '!').Trim().ToLowerInvariant(), " ");

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();

    public T? Get(string key) => options.CurrentValue.Enabled && entries.TryGetValue(key, out var e) ? e.Value : null;

    public void Set(string key, T value)
    {
        if (!options.CurrentValue.Enabled)
            return;
        entries[key] = (value, Interlocked.Increment(ref order));
        var max = Math.Max(1, options.CurrentValue.MaxEntries);
        if (entries.Count > max)
            foreach (var old in entries.OrderBy(e => e.Value.Order).Take(entries.Count - max).ToList())
                entries.TryRemove(old.Key, out _);
    }
}
