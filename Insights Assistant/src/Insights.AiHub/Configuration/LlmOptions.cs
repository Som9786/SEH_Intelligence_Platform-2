namespace Insights.AiHub.Configuration;

/// Which model service answers: "OpenAI" (the OpenAI section) or "Bedrock" (the Bedrock section). Read on every call, so a
/// change in appsettings.json takes effect without a restart.
public sealed class LlmOptions
{
    public const string SectionName = "Llm";
    public const string OpenAI = "OpenAI";
    public const string Bedrock = "Bedrock";

    public string Provider { get; set; } = OpenAI;

    public bool UsesBedrock => string.Equals(Provider?.Trim(), Bedrock, StringComparison.OrdinalIgnoreCase);
}

/// Settings both providers share: the model, its fallback, the time limit, the daily budget and the prices.
public abstract class LlmProviderOptions
{
    /// Model to use. When empty, FallbackModel is used.
    public string Model { get; set; } = "";
    /// Used when Model is empty, or when the configured model doesn't exist or isn't available to the key.
    public string FallbackModel { get; set; } = "";
    /// How long one model call may take. Reasoning models can take minutes; keep it under Analytics' AiHub:TimeoutSeconds.
    public int TimeoutSeconds { get; set; } = 150;
    /// Questions are refused once today's cost (this AI Hub's calls, local time) reaches this many US dollars. 0 = no limit.
    public decimal DailyBudgetUsd { get; set; }
    /// US dollars per million tokens, by model name. A reply's model ("gpt-5-2025-08-07") uses the longest name it starts with,
    /// so "gpt-5-mini" wins over "gpt-5". Copy these from the provider's pricing page; a model with no price is counted without a cost.
    public Dictionary<string, ModelPrice> Prices { get; set; } = [];

    /// The model calls go to: Model, or FallbackModel when Model is empty.
    public string ConfiguredModel => string.IsNullOrWhiteSpace(Model) ? FallbackModel : Model;
}

public sealed class ModelPrice
{
    public decimal InputPerMillion { get; set; }
    /// Input tokens served from the provider's prompt cache, usually a tenth of the input price.
    public decimal CachedInputPerMillion { get; set; }
    /// Input tokens written to the prompt cache (Bedrock bills them above the input price). 0 = the input price.
    public decimal CacheWriteInputPerMillion { get; set; }
    /// Output tokens, including a reasoning model's hidden reasoning tokens.
    public decimal OutputPerMillion { get; set; }
}
