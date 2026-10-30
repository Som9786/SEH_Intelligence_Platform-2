namespace Insights.Analytics.Configuration;

/// The pos_basket database every answer's data is read from (read-only): PostgreSQL or SQL Server, chosen by Provider.
/// Both hold the same table; the knowledge model names the PostgreSQL one, and SqlServer.Schema says where it is in SQL Server.
/// Read once at startup: restart the service after switching.
public sealed class PosBasketOptions
{
    public const string SectionName = "PosBasket";

    public DataProvider Provider { get; set; } = DataProvider.PostgreSQL;

    // PostgreSQL. Kept at the top of the section, so PosBasket:Password and PosBasket__Password still set its password.
    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 5432;
    public string Database { get; set; } = "pos_basket";
    /// For anything beyond a local POC, a user that can only SELECT from the knowledge model's tables.
    public string User { get; set; } = "postgres";
    public string Password { get; set; } = "";

    public SqlServerOptions SqlServer { get; set; } = new();
}

public sealed class SqlServerOptions
{
    /// For anything beyond a local POC, a login that is only in db_datareader: SQL Server has no read-only transaction.
    public string ConnectionString { get; set; } = "";
    /// The schema the knowledge model's tables are in (public.pos_basket_line is read as dbo.pos_basket_line).
    public string Schema { get; set; } = "dbo";
}

public enum DataProvider
{
    PostgreSQL,
    SqlServer,
}
