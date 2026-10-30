namespace Insights.AiHub.Configuration;

/// Used when Llm:Provider is "OpenAI".
public sealed class OpenAIOptions : LlmProviderOptions
{
    public const string SectionName = "OpenAI";

    public OpenAIOptions() => FallbackModel = "gpt-5";

    /// Falls back to the OPENAI_API_KEY environment variable when empty.
    public string ApiKey { get; set; } = "";
    /// How hard a reasoning model (gpt-5*, o*) thinks before answering: minimal, low, medium or high. Lower is faster and
    /// cheaper. Empty leaves OpenAI's default (medium). Not sent to other models, which don't support it.
    public string ReasoningEffort { get; set; } = "low";
}
