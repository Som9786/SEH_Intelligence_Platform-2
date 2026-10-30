namespace Insights.DbCatalog.Configuration;

/// Connection to the Neo4j database that holds the database catalog graph (never the database's data).
public sealed class Neo4jOptions
{
    public const string SectionName = "Neo4j";

    public string Uri { get; set; } = "neo4j://127.0.0.1:7687";
    public string User { get; set; } = "neo4j";
    public string Password { get; set; } = "";
    public string Database { get; set; } = "db-guide";
}
