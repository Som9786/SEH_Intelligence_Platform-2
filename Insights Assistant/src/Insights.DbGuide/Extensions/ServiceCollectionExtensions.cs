using Insights.DbGuide.Configuration;
using Insights.DbGuide.Filters;
using Insights.DbGuide.Services.AiHub;
using Insights.DbGuide.Services.Ask;
using Insights.DbGuide.Services.Catalog;
using Microsoft.Extensions.Options;
using Neo4j.Driver;

namespace Insights.DbGuide.Extensions;

public static class ServiceCollectionExtensions
{
    /// Registers the options, the Neo4j driver (catalog graph), the catalog services and the AI Hub client.
    public static IServiceCollection AddDbGuide(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<Neo4jOptions>(configuration.GetSection(Neo4jOptions.SectionName));
        services.Configure<CatalogOptions>(configuration.GetSection(CatalogOptions.SectionName));
        services.Configure<GuideOptions>(configuration.GetSection(GuideOptions.SectionName));
        services.Configure<AiHubOptions>(configuration.GetSection(AiHubOptions.SectionName));

        services.AddSingleton<IDriver>(sp =>
        {
            var o = sp.GetRequiredService<IOptions<Neo4jOptions>>().Value;
            if (string.IsNullOrEmpty(o.Password))
                throw new InvalidOperationException("Neo4j:Password is not configured. Set it with user-secrets or the Neo4j__Password environment variable.");
            return GraphDatabase.Driver(o.Uri, AuthTokens.Basic(o.User, o.Password));
        });

        // Neo4j down, a broken catalog export, or AI Hub failures -> a problem response with the cause rather than a generic 500.
        services.AddExceptionHandler<ErrorHandler>();

        // The catalog in Neo4j: loaded from the export at startup and on every change, and read for each question.
        services.AddSingleton<CatalogFiles>();
        services.AddSingleton<CatalogLoader>();
        services.AddSingleton<CatalogReader>();
        services.AddHostedService<CatalogWatcher>();

        // The AI Hub, called server to server for /ask.
        services.AddHttpClient(AiHubClient.HttpClientName, (sp, http) =>
        {
            var o = sp.GetRequiredService<IOptions<AiHubOptions>>().Value;
            http.BaseAddress = new Uri(o.BaseUrl.TrimEnd('/') + "/");
            http.Timeout = TimeSpan.FromSeconds(o.TimeoutSeconds);
        });
        services.AddSingleton<AiHubClient>();
        services.AddSingleton<AskService>();

        return services;
    }
}
