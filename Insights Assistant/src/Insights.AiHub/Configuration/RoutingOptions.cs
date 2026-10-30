namespace Insights.AiHub.Configuration;

/// Where POST /ask passes each question on to, once POST /intent has said which kind it is: questions about the data to
/// Analytics (Analytics:BaseUrl, POST /ask), questions about a database's structure to DB Guide (POST /ask).
public sealed class RoutingOptions
{
    public const string SectionName = "Routing";

    public string DbGuideBaseUrl { get; set; } = "http://localhost:5300";
    /// How long a routed question may take. Analytics makes two model calls and runs a query, so allow minutes.
    public int TimeoutSeconds { get; set; } = 300;
}
