namespace Insights.AiHub.Configuration;

/// Where each question's knowledge model context is loaded from (Analytics POST /context).
public sealed class AnalyticsOptions
{
    public const string SectionName = "Analytics";

    public string BaseUrl { get; set; } = "http://localhost:5100";
}
