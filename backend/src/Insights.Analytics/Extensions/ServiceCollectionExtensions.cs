using Insights.Analytics.Configuration;
using Insights.Analytics.Filters;
using Insights.Analytics.Services.AiHub;
using Insights.Analytics.Services.Ask;
using Insights.Analytics.Services.Data;
using Insights.Analytics.Services.Dataset;
using Insights.Analytics.Services.KnowledgeModel;
using Insights.Analytics.Services.Query;
using Insights.Common.AiHub;
using Microsoft.Extensions.Options;
using Neo4j.Driver;

namespace Insights.Analytics.Extensions;

public static class ServiceCollectionExtensions
{
    /// Registers the options, the Neo4j driver (knowledge model), the data's database (PostgreSQL or SQL Server), and the knowledge model, query and AI services.
    public static IServiceCollection AddAnalytics(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<Neo4jOptions>(configuration.GetSection(Neo4jOptions.SectionName));
        services.Configure<PosBasketOptions>(configuration.GetSection(PosBasketOptions.SectionName));
        services.Configure<KnowledgeModelOptions>(configuration.GetSection(KnowledgeModelOptions.SectionName));
        services.Configure<DatasetOptions>(configuration.GetSection(DatasetOptions.SectionName));
        services.Configure<QueryOptions>(configuration.GetSection(QueryOptions.SectionName));

        services.AddSingleton<IDriver>(sp =>
        {
            var o = sp.GetRequiredService<IOptions<Neo4jOptions>>().Value;
            if (string.IsNullOrEmpty(o.Password))
                throw new InvalidOperationException("Neo4j:Password is not configured. Set it with user-secrets or the Neo4j__Password environment variable.");
            return GraphDatabase.Driver(o.Uri, AuthTokens.Basic(o.User, o.Password));
        });
        services.AddSingleton<PosBasketDatabase>();

        // Neo4j or the data's database down, or broken knowledge model files -> a problem response with the cause rather than a generic 500.
        services.AddExceptionHandler<DatabaseErrorHandler>();

        // The knowledge model in Neo4j: loaded from the files at startup and on every change, and read for each question.
        services.AddSingleton<DataCoverageService>();
        services.AddSingleton<KnowledgeModelLoader>();
        services.AddSingleton<KnowledgeModelReader>();
        services.AddHostedService<KnowledgeModelWatcher>();

        // Read-only SQL on the data's database.
        services.AddSingleton<SqlQueryService>();

        // The AI Hub, called server to server for /ai/* and /ask.
        services.AddAiHubConnection(configuration);
        services.AddSingleton<AiHubClient>();
        services.AddSingleton<AskService>();
        // POST /recommend: a baseline query, then actions from the AI Hub.
        services.AddSingleton<RecommendService>();

        // Answer ratings, and the example queries saved from them.
        services.AddSingleton<FeedbackStore>();
        services.AddSingleton<ExampleStore>();

        return services;
    }
}
