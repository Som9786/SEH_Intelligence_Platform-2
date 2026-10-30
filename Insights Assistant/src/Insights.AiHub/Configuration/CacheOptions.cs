namespace Insights.AiHub.Configuration;

/// Reuses replies to repeated questions instead of paying OpenAI again. A query is reused while the question's knowledge model
/// context is the same (it changes with the knowledge model, rules, examples and the dates the data covers); an answer while the
/// query and its results are the same.
public sealed class CacheOptions
{
    public const string SectionName = "Cache";

    public bool Enabled { get; set; } = true;
    /// Most entries kept for queries and for answers, each; the oldest are dropped first.
    public int MaxEntries { get; set; } = 500;
}
