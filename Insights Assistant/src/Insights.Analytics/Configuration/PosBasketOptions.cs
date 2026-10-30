namespace Insights.Analytics.Configuration;

/// Connection to the pos_basket PostgreSQL database, where every answer's data is read from (read-only).
public sealed class PosBasketOptions
{
    public const string SectionName = "PosBasket";

    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 5432;
    public string Database { get; set; } = "pos_basket";
    /// For anything beyond a local POC, a user that can only SELECT from the knowledge model's tables.
    public string User { get; set; } = "postgres";
    public string Password { get; set; } = "";
}
