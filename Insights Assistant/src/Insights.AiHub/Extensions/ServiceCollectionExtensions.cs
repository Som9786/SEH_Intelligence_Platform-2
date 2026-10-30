using Insights.AiHub.Configuration;
using Insights.AiHub.Services.Answer;
using Insights.AiHub.Services.Guide;
using Insights.AiHub.Services.Llm;
using Insights.AiHub.Services.KnowledgeModel;
using Insights.AiHub.Services.Routing;
using Insights.AiHub.Services.Sql;
using Microsoft.Extensions.Options;

namespace Insights.AiHub.Extensions;

public static class ServiceCollectionExtensions
{
    /// Registers the options, the model (OpenAI or Bedrock, by Llm:Provider) and analytics-service clients, the SQL, answer and guide services, and the intent
    /// routing. No CORS: browsers never call the AI Hub directly; Analytics and DB Guide do, and the gateway.
    public static IServiceCollection AddAiHub(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<LlmOptions>(configuration.GetSection(LlmOptions.SectionName));
        services.Configure<OpenAIOptions>(configuration.GetSection(OpenAIOptions.SectionName));
        services.Configure<BedrockOptions>(configuration.GetSection(BedrockOptions.SectionName));
        services.Configure<AnalyticsOptions>(configuration.GetSection(AnalyticsOptions.SectionName));
        services.Configure<AnswerOptions>(configuration.GetSection(AnswerOptions.SectionName));
        services.Configure<CacheOptions>(configuration.GetSection(CacheOptions.SectionName));

        services.AddHttpClient(KnowledgeModelClient.HttpClientName, (sp, http) =>
        {
            var baseUrl = sp.GetRequiredService<IOptions<AnalyticsOptions>>().Value.BaseUrl;
            http.BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/");
        });
        // Fetches each question's part of the knowledge model from the analytics service.
        services.AddSingleton<KnowledgeModelClient>();
        // Singleton: one running total of model cost, served by GET /usage.
        services.AddSingleton<UsageTracker>();
        // Singletons: replies reused across requests (Cache:*).
        services.AddSingleton(typeof(ResponseCache<>));
        // Both providers are registered; LlmClient picks one on each call from Llm:Provider.
        services.AddSingleton<OpenAIChat>();
        services.AddSingleton<BedrockChat>();
        services.AddSingleton<LlmClient>();
        services.AddSingleton<SqlGenerationService>();
        services.AddSingleton<AnswerService>();
        // Answers questions about a database's structure for DB Guide, from the catalog context it sends.
        services.AddSingleton<GuideService>();

        // POST /intent and POST /ask: tells questions about the data from questions about the database, and passes each
        // on to Analytics or DB Guide.
        services.Configure<RoutingOptions>(configuration.GetSection(RoutingOptions.SectionName));
        services.AddHttpClient(RoutingClients.Analytics, (sp, http) =>
        {
            http.BaseAddress = new Uri(sp.GetRequiredService<IOptions<AnalyticsOptions>>().Value.BaseUrl.TrimEnd('/') + "/");
            http.Timeout = TimeSpan.FromSeconds(sp.GetRequiredService<IOptions<RoutingOptions>>().Value.TimeoutSeconds);
        });
        services.AddHttpClient(RoutingClients.DbGuide, (sp, http) =>
        {
            var routing = sp.GetRequiredService<IOptions<RoutingOptions>>().Value;
            http.BaseAddress = new Uri(routing.DbGuideBaseUrl.TrimEnd('/') + "/");
            http.Timeout = TimeSpan.FromSeconds(routing.TimeoutSeconds);
        });
        services.AddSingleton<ServiceProfiles>();
        services.AddSingleton<IntentService>();
        services.AddSingleton<AskRouter>();
        services.AddSingleton<FollowUpService>();

        return services;
    }
}
