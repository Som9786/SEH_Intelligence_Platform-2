namespace Insights.AiHub.Configuration;

public sealed class OpenAIOptions
{
    public const string SectionName = "OpenAI";

    /// Falls back to the OPENAI_API_KEY environment variable when empty.
    public string ApiKey { get; set; } = "";
    /// Model to use. When empty, FallbackModel is used.
    public string Model { get; set; } = "";
    /// Used when Model is empty, or when the configured model doesn't exist or isn't available to the key.
    public string FallbackModel { get; set; } = "gpt-5";
    /// How long one model call may take. Reasoning models can take minutes; keep it under Analytics' AiHub:TimeoutSeconds.
    public int TimeoutSeconds { get; set; } = 150;
    /// How hard a reasoning model (gpt-5*, o*) thinks before answering: minimal, low, medium or high. Lower is faster and
    /// cheaper. Empty leaves OpenAI's default (medium). Not sent to other models, which don't support it.
    public string ReasoningEffort { get; set; } = "low";
    /// Questions are refused once today's OpenAI cost (this AI Hub's calls, local time) reaches this many US dollars. 0 = no limit.
    public decimal DailyBudgetUsd { get; set; }
    /// US dollars per million tokens, by model name. A reply's model ("gpt-5-2025-08-07") uses the longest name it starts with,
    /// so "gpt-5-mini" wins over "gpt-5". Copy these from OpenAI's pricing page; a model with no price is counted without a cost.
    public Dictionary<string, ModelPrice> Prices { get; set; } = [];
}

public sealed class ModelPrice
{
    public decimal InputPerMillion { get; set; }
    /// Input tokens OpenAI served from its prompt cache, usually a tenth of the input price.
    public decimal CachedInputPerMillion { get; set; }
    /// Output tokens, including a reasoning model's hidden reasoning tokens.
    public decimal OutputPerMillion { get; set; }
}
