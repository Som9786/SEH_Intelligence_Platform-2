using System.Text.Json;
using Insights.AiHub.Configuration;
using Insights.AiHub.Models;
using Microsoft.Extensions.Options;

namespace Insights.AiHub.Services.Llm;

/// Prices each OpenAI call from the tokens in its reply and keeps a running total, and today's total, in
/// App_Data/openai-usage.json, so they survive restarts. It counts only this AI Hub's calls, not other uses of the same
/// API key. Delete the file to start counting again.
public sealed class UsageTracker(IOptionsMonitor<OpenAIOptions> options, IHostEnvironment env, ILogger<UsageTracker> logger)
{
    static readonly JsonSerializerOptions FileJson = new(JsonSerializerOptions.Web) { WriteIndented = true };

    readonly Lock gate = new();
    readonly string path = Path.Combine(env.ContentRootPath, "App_Data", "openai-usage.json");
    UsageTotals? totals;

    static string Today => DateTime.Now.ToString("yyyy-MM-dd");

    /// Throws BudgetExceededException when today's cost has reached OpenAI:DailyBudgetUsd. Called before each model call;
    /// the call that crosses the limit still completes, so a day can end slightly over it.
    public void EnsureWithinBudget()
    {
        var budget = options.CurrentValue.DailyBudgetUsd;
        if (budget <= 0)
            return;
        var spent = Totals().TodayCostUsd;
        if (spent >= budget)
        {
            logger.LogWarning("OpenAI: daily budget reached (${Spent:0.00} of ${Budget:0.00}); refusing the call", spent, budget);
            throw new BudgetExceededException(
                $"Today's OpenAI cost (${spent:0.00}) has reached the daily budget of ${budget:0.00} (OpenAI:DailyBudgetUsd). " +
                "Questions work again tomorrow, or raise the budget in the AI Hub's appsettings.json.");
        }
    }

    /// The call's usage with its cost, after adding it to the running totals.
    public LlmUsage Record(string model, int inputTokens, int cachedInputTokens, int outputTokens, int reasoningTokens)
    {
        decimal? cost = null;
        if (PriceFor(model) is { } price)
            cost = ((inputTokens - cachedInputTokens) * price.InputPerMillion + cachedInputTokens * price.CachedInputPerMillion
                + outputTokens * price.OutputPerMillion) / 1_000_000m;
        else
            logger.LogWarning("OpenAI: no price for model {Model} in OpenAI:Prices, so this call is counted without a cost", model);

        var usage = new LlmUsage(model, inputTokens, cachedInputTokens, outputTokens, reasoningTokens, cost);
        UsageTotals t;
        lock (gate)
        {
            t = Current();
            var models = new Dictionary<string, ModelUsageTotals>(t.Models);
            var m = models.GetValueOrDefault(model) ?? new(0, 0, 0, 0);
            models[model] = new(m.Calls + 1, m.InputTokens + inputTokens, m.OutputTokens + outputTokens, m.CostUsd + (cost ?? 0));
            totals = t = t with
            {
                Calls = t.Calls + 1, InputTokens = t.InputTokens + inputTokens, OutputTokens = t.OutputTokens + outputTokens,
                CostUsd = t.CostUsd + (cost ?? 0), UnpricedCalls = t.UnpricedCalls + (cost is null ? 1 : 0), Models = models,
                TodayCostUsd = t.TodayCostUsd + (cost ?? 0),
            };
            Save(t);
        }
        logger.LogInformation("OpenAI: this call cost {Cost}; today {Today}, {Total} over {Calls} calls since {Since:d}",
            cost is { } c ? $"${c:0.0000}" : "an unknown amount", $"${t.TodayCostUsd:0.0000}", $"${t.CostUsd:0.0000}", t.Calls, t.Since);
        return usage;
    }

    public UsageTotals Totals()
    {
        lock (gate)
            return Current() with { DailyBudgetUsd = options.CurrentValue.DailyBudgetUsd };
    }

    ModelPrice? PriceFor(string model) => options.CurrentValue.Prices
        .Where(p => model.StartsWith(p.Key, StringComparison.OrdinalIgnoreCase))
        .MaxBy(p => p.Key.Length).Value;

    /// Call with the lock held. The totals, read from the file on first use, with today's cost reset on a new day.
    UsageTotals Current()
    {
        if (totals is null)
        {
            try
            {
                if (File.Exists(path))
                    totals = JsonSerializer.Deserialize<UsageTotals>(File.ReadAllText(path), FileJson);
            }
            catch (Exception e) when (e is IOException or JsonException)
            {
                logger.LogWarning("Could not read the OpenAI usage from {Path}, so counting starts again: {Message}", path, e.Message);
            }
            totals ??= new(DateTimeOffset.UtcNow, 0, 0, 0, 0, 0, new Dictionary<string, ModelUsageTotals>());
        }
        if (totals.Today != Today)
            totals = totals with { Today = Today, TodayCostUsd = 0 };
        return totals;
    }

    void Save(UsageTotals t)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, JsonSerializer.Serialize(t, FileJson));
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning("Could not save the OpenAI usage to {Path}: {Message}", path, e.Message);
        }
    }
}
