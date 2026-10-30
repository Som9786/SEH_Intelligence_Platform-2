using System.Text.RegularExpressions;

namespace Insights.DbGuide.Services.Catalog;

/// Turns table and column names, synonyms and questions into the same normalized words, so "Which products?" finds the
/// table Products and "order items" the table OrderItems.
/// Words are split at camel case (OrderItems -> order item), lowercased and made singular the naive way
/// (products -> product, categories -> category). That only has to be consistent on both sides, not correct English.
static partial class Terms
{
    /// Longest synonym, in words, that a question can match.
    const int MaxWords = 4;

    /// A name or synonym as one term: "Net sales" -> "net sale".
    public static string Normalize(string text) => string.Join(' ', Words(text));

    /// Every run of 1 to 4 consecutive words in the text, normalized: the terms the text can match.
    public static HashSet<string> Phrases(string text)
    {
        var words = Words(text);
        var phrases = new HashSet<string>();
        for (var i = 0; i < words.Count; i++)
            for (var n = 1; n <= MaxWords && i + n <= words.Count; n++)
                phrases.Add(string.Join(' ', words.GetRange(i, n)));
        return phrases;
    }

    static List<string> Words(string text) =>
        Word().Matches(CamelCase().Replace(text, " ").ToLowerInvariant()).Select(m => Singular(m.Value)).ToList();

    static string Singular(string word) =>
        word.Length > 4 && word.EndsWith("ies") ? word[..^3] + "y"
        : word.Length > 3 && word.EndsWith('s') && !word.EndsWith("ss") ? word[..^1]
        : word;

    [GeneratedRegex("[a-z0-9]+")]
    private static partial Regex Word();

    [GeneratedRegex("(?<=[a-z])(?=[A-Z])")]
    private static partial Regex CamelCase();
}
