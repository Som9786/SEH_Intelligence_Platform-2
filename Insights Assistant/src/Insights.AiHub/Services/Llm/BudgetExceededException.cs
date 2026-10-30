namespace Insights.AiHub.Services.Llm;

/// Today's OpenAI cost has reached OpenAI:DailyBudgetUsd, so no more model calls are made today.
public sealed class BudgetExceededException(string message) : Exception(message);
