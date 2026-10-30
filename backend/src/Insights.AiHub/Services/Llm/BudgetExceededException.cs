namespace Insights.AiHub.Services.Llm;

/// Today's model cost has reached the active provider's DailyBudgetUsd, so no more model calls are made today.
public sealed class BudgetExceededException(string message) : Exception(message);
