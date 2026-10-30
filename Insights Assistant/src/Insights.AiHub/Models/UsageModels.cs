namespace Insights.AiHub.Models;

/// Tokens and cost of one OpenAI call. CostUsd is null when OpenAI:Prices has no price for the model.
/// InputTokens includes CachedInputTokens, and OutputTokens includes ReasoningTokens, as OpenAI reports them.
public sealed record LlmUsage(string Model, int InputTokens, int CachedInputTokens, int OutputTokens, int ReasoningTokens, decimal? CostUsd);

/// Response of GET /usage: every OpenAI call this AI Hub has made since Since, counted from each reply's token counts.
/// Today is the local date that TodayCostUsd covers; DailyBudgetUsd is OpenAI:DailyBudgetUsd (0 = no limit).
public sealed record UsageTotals(DateTimeOffset Since, int Calls, long InputTokens, long OutputTokens, decimal CostUsd,
    int UnpricedCalls, IReadOnlyDictionary<string, ModelUsageTotals> Models,
    string Today = "", decimal TodayCostUsd = 0, decimal DailyBudgetUsd = 0);

/// One model's share of UsageTotals.
public sealed record ModelUsageTotals(int Calls, long InputTokens, long OutputTokens, decimal CostUsd);
