using System.Data.Common;
using System.Text.RegularExpressions;
using Insights.Analytics.Configuration;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Insights.Analytics.Services.Data;

/// The pos_basket database every answer is read from, PostgreSQL or SQL Server (PosBasket:Provider): one connection pool
/// for the app, created on first use. The knowledge model names tables as they are in PostgreSQL (public.pos_basket_line);
/// TableName and WithTableNames give their names in the database actually used.
public sealed class PosBasketDatabase(IOptions<PosBasketOptions> options) : IAsyncDisposable
{
    readonly Lazy<NpgsqlDataSource> postgres = new(() => NpgsqlDataSource.Create(new NpgsqlConnectionStringBuilder
    {
        Host = options.Value.Host, Port = options.Value.Port, Database = options.Value.Database,
        Username = options.Value.User, Password = options.Value.Password,
        ApplicationName = "Insights.Analytics",
        // Seconds to wait for a connection, so a stopped database is reported quickly.
        Timeout = 10,
    }.ConnectionString));

    readonly Lazy<string> sqlServer = new(() => new SqlConnectionStringBuilder(options.Value.SqlServer.ConnectionString)
    {
        ApplicationName = "Insights.Analytics",
        ConnectTimeout = 10,
    }.ConnectionString);

    public DataProvider Provider => options.Value.Provider;

    /// The SQL dialect queries are written in, as the AI and the Q&A page name it.
    public string Dialect => Provider == DataProvider.SqlServer ? "SQL Server" : "PostgreSQL";

    /// "PostgreSQL pos_basket on localhost:5432" or "SQL Server pos_basket on localhost", for messages.
    public string Name
    {
        get
        {
            if (Provider != DataProvider.SqlServer)
                return $"PostgreSQL {options.Value.Database} on {options.Value.Host}:{options.Value.Port}";
            var server = new SqlConnectionStringBuilder(sqlServer.Value);
            return $"SQL Server {server.InitialCatalog} on {server.DataSource}";
        }
    }

    /// The table's name in this database: public.pos_basket_line, or dbo.pos_basket_line on SQL Server.
    public string TableName(string knowledgeModelName) =>
        Provider == DataProvider.SqlServer
            ? $"{options.Value.SqlServer.Schema}.{knowledgeModelName[(knowledgeModelName.LastIndexOf('.') + 1)..]}"
            : knowledgeModelName;

    /// Text from the knowledge model (a rule, an example query) with its tables' names as they are in this database.
    public string WithTableNames(string text, IEnumerable<string> knowledgeModelTables) =>
        Provider == DataProvider.SqlServer
            ? knowledgeModelTables.Aggregate(text, (t, name) =>
                Regex.Replace(t, $@"(?<![\w.]){Regex.Escape(name)}\b", TableName(name), RegexOptions.IgnoreCase))
            : text;

    /// A column's type as this database names it: boolean is bit on SQL Server, uuid uniqueidentifier, and so on.
    public string ColumnType(string knowledgeModelType) =>
        Provider != DataProvider.SqlServer ? knowledgeModelType : knowledgeModelType.ToLowerInvariant() switch
        {
            "boolean" or "bool" => "bit (1 = true)",
            "uuid" => "uniqueidentifier",
            "timestamp" or "timestamp without time zone" => "datetime2",
            "timestamptz" or "timestamp with time zone" => "datetimeoffset",
            "numeric" => "decimal",
            "integer" => "int",
            "text" => "varchar(max)",
            "double precision" => "float",
            _ => knowledgeModelType,
        };

    /// Fails with DataUnavailableException when the database can't be reached or signed in to, or has no password set.
    public async ValueTask<DbConnection> OpenAsync(CancellationToken ct)
    {
        try
        {
            if (Provider == DataProvider.SqlServer)
            {
                if (string.IsNullOrWhiteSpace(options.Value.SqlServer.ConnectionString))
                    throw new DataUnavailableException("PosBasket:SqlServer:ConnectionString is not configured.");
                var connection = new SqlConnection(sqlServer.Value);
                try
                {
                    await connection.OpenAsync(ct);
                }
                catch
                {
                    await connection.DisposeAsync();
                    throw;
                }
                return connection;
            }
            if (string.IsNullOrEmpty(options.Value.Password))
                throw new DataUnavailableException("PosBasket:Password is not configured. Set it with user-secrets or the PosBasket__Password environment variable.");
            return await postgres.Value.OpenConnectionAsync(ct);
        }
        catch (Exception e) when (e is DbException or TimeoutException)
        {
            throw new DataUnavailableException(e.Message, e);
        }
    }

    public ValueTask DisposeAsync() => postgres.IsValueCreated ? postgres.Value.DisposeAsync() : ValueTask.CompletedTask;
}

/// The data's database couldn't be reached, signed in to, or isn't configured.
public sealed class DataUnavailableException(string message, Exception? inner = null) : Exception(message, inner);
