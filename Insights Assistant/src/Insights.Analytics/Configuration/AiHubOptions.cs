namespace Insights.Analytics.Configuration;

/// Where the AI Hub runs. Analytics forwards /ai/* and /ask to it, so clients only talk to Analytics.
public sealed class AiHubOptions
{
    public const string SectionName = "AiHub";

    public string BaseUrl { get; set; } = "http://localhost:5200";
    /// Per call to the AI Hub. Writing SQL or an answer with a reasoning model can take a minute or more.
    public int TimeoutSeconds { get; set; } = 180;
}
