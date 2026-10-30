namespace Insights.Gateway;

/// Finds the GatewayOptions.Allow rule for an /api/<service>/<path> request.
public static class ApiAllowList
{
    /// The functionalities that may make the request ("*" for anyone signed in), or null when no rule lists it.
    /// HEAD is allowed wherever GET is.
    public static IReadOnlyList<string>? Find(GatewayOptions options, string method, string service, string path)
    {
        if (!options.Allow.TryGetValue(service, out var rules))
            return null;
        if (HttpMethods.IsHead(method))
            method = HttpMethods.Get;
        path = path.Trim('/');
        foreach (var (rule, features) in rules)
        {
            var space = rule.IndexOf(' ');
            if (space < 0 || !string.Equals(rule[..space], method, StringComparison.OrdinalIgnoreCase))
                continue;
            var pattern = rule[(space + 1)..].Trim().Trim('/');
            var matches = pattern.EndsWith('*')
                ? path.StartsWith(pattern[..^1], StringComparison.OrdinalIgnoreCase) && path.Length > pattern.Length - 1
                : string.Equals(path, pattern, StringComparison.OrdinalIgnoreCase);
            if (matches)
                return features.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        }
        return null;
    }
}
