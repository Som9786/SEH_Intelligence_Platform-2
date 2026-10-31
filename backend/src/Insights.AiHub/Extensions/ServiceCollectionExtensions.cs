using Insights.AiHub.Configuration;
using Insights.AiHub.Services.Answer;
using Insights.AiHub.Services.Guide;
using Insights.AiHub.Services.Llm;
using Insights.AiHub.Services.Routing;
using Insights.AiHub.Services.Sql;

namespace Insights.AiHub.Extensions;

public static class ServiceCollectionExtensions
{
    /// Registers the options, the model client (OpenAI or Bedrock, by Llm:Provider), and the SQL, answer, guide, intent and
    /// follow-up services. The AI Hub calls only the model: callers send whatever context a prompt needs. No CORS: browsers
    /// never call the AI Hub directly; Analytics, DB Catalog and the gateway do.
    public static IServiceCollection AddAiHub(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<LlmOptions>(configuration.GetSection(LlmOptions.SectionName));
        services.Configure<OpenAIOptions>(configuration.GetSection(OpenAIOptions.SectionName));
        services.Configure<BedrockOptions>(configuration.GetSection(BedrockOptions.SectionName));
        services.Configure<AnswerOptions>(configuration.GetSection(AnswerOptions.SectionName));
        services.Configure<CacheOptions>(configuration.GetSection(CacheOptions.SectionName));

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
        // POST /recommendations: what to do about an answer, asked after it is shown.
        services.AddSingleton<RecommendationService>();
        // Answers questions about a database's structure for DB Catalog, from the catalog context it sends.
        services.AddSingleton<GuideService>();

        // POST /intent and POST /follow-ups: which service a question is for, and what to ask next. Model calls only.
        services.AddSingleton<IntentService>();
        services.AddSingleton<FollowUpService>();

        return services;
    }
}
