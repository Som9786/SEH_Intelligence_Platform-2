namespace Insights.Common.AiHub;

/// Where the AI Hub runs, and how long to wait for it. Analytics and DB Guide call it server to server.
public sealed class AiHubOptions
{
    public const string SectionName = "AiHub";

    public string BaseUrl { get; set; } = "http://localhost:5200";
    /// Per call to the AI Hub. Writing SQL or an answer with a reasoning model can take a minute or more.
    public int TimeoutSeconds { get; set; } = 180;
}
