namespace Insights.DbGuide.Configuration;

/// Where questions go to be answered in plain English (AI Hub POST /guide), and how long to wait.
public sealed class AiHubOptions
{
    public const string SectionName = "AiHub";

    public string BaseUrl { get; set; } = "http://localhost:5200";
    public int TimeoutSeconds { get; set; } = 180;
}
