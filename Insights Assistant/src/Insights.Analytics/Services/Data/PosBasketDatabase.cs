using Insights.Analytics.Configuration;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Insights.Analytics.Services.Data;

/// The pos_basket PostgreSQL database every answer is read from: one connection pool for the app, created on first use.
public sealed class PosBasketDatabase(IOptions<PosBasketOptions> options) : IAsyncDisposable
{
    readonly Lazy<NpgsqlDataSource> dataSource = new(() => NpgsqlDataSource.Create(new NpgsqlConnectionStringBuilder
    {
        Host = options.Value.Host, Port = options.Value.Port, Database = options.Value.Database,
        Username = options.Value.User, Password = options.Value.Password,
        ApplicationName = "Insights.Analytics",
        // Seconds to wait for a connection, so a stopped database is reported quickly.
        Timeout = 10,
    }.ConnectionString));

    /// "pos_basket on localhost:5432", for messages.
    public string Name => $"{options.Value.Database} on {options.Value.Host}:{options.Value.Port}";

    /// A missing password is an NpgsqlException too, so callers report it the same way as a database that's down.
    public async ValueTask<NpgsqlConnection> OpenAsync(CancellationToken ct)
    {
        if (string.IsNullOrEmpty(options.Value.Password))
            throw new NpgsqlException("PosBasket:Password is not configured. Set it with user-secrets or the PosBasket__Password environment variable.");
        return await dataSource.Value.OpenConnectionAsync(ct);
    }

    public ValueTask DisposeAsync() => dataSource.IsValueCreated ? dataSource.Value.DisposeAsync() : ValueTask.CompletedTask;
}
