namespace Insights.Analytics.Configuration;

/// Connection to the Neo4j database that holds the knowledge model (never the sales data).
public sealed class Neo4jOptions
{
    public const string SectionName = "Neo4j";

    public string Uri { get; set; } = "neo4j://127.0.0.1:7687";
    public string User { get; set; } = "neo4j";
    public string Password { get; set; } = "";
    public string Database { get; set; } = "neo4j";
}
