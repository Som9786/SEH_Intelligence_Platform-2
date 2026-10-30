namespace Insights.Analytics.Models;

/// What the Q&A page shows for the dataset: its name and example questions.
public sealed record DatasetInfo(string Name, IReadOnlyList<string> Suggestions);
