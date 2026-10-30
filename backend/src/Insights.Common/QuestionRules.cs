namespace Insights.Common;

/// What a question sent to Analytics, DB Catalog or AI Hub must look like. One place, so every service answers the same.
public static class QuestionRules
{
    /// Longer questions are refused: a real question fits easily, and a huge paste would spend the day's AI budget.
    public const int MaxLength = 2000;

    /// Why the question can't be asked, or null when it can.
    public static string? Problem(string? question) =>
        string.IsNullOrWhiteSpace(question) ? "'question' is required."
        : question.Length > MaxLength ? $"The question is too long: keep it under {MaxLength:N0} characters."
        : null;
}
