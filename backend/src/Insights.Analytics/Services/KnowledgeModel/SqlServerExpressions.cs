using System.Text.RegularExpressions;

namespace Insights.Analytics.Services.KnowledgeModel;

/// Rewrites the PostgreSQL in the knowledge model's formulas and rules as T-SQL, for when the data is in SQL Server.
/// The AI copies metric formulas as given, so they reach it already in its dialect. It covers what the knowledge model
/// uses: agg(x) FILTER (WHERE c), extract(hour | isodow | ... FROM x), to_char(x, 'FMDay'), x::type, ILIKE, and boolean
/// columns used as conditions (is_ebt -> is_ebt = 1). Anything else is left as written, for the AI to translate.
public static partial class SqlServerExpressions
{
    public static string Translate(string sql, IReadOnlySet<string> booleanColumns)
    {
        var text = sql;
        text = Filters(text, booleanColumns);
        text = Calls(text, "extract", (inner) => FieldFrom().Match(inner) is { Success: true } m ? Extract(m.Groups[1].Value, m.Groups[2].Value) : null);
        text = Calls(text, "to_char", (inner) => FmDay().Match(inner) is { Success: true } m ? $"DATENAME(weekday, {m.Groups[1].Value.Trim()})" : null);
        text = Casts(text);
        return Ilike().Replace(text, "LIKE");
    }

    /// agg(x) FILTER (WHERE c) -> agg(CASE WHEN c THEN x END), keeping DISTINCT in front: count(DISTINCT CASE ...).
    static string Filters(string text, IReadOnlySet<string> booleanColumns)
    {
        while (Filter().Match(text) is { Success: true } m)
        {
            var aggClose = m.Index;
            var aggOpen = OpenOf(text, aggClose);
            var filterClose = CloseOf(text, m.Groups[1].Index);
            if (aggOpen < 0 || filterClose < 0)
                break;
            var args = text[(aggOpen + 1)..aggClose].Trim();
            var distinct = DistinctPrefix().Match(args).Value;
            var value = args[distinct.Length..].Trim();
            // count(*) FILTER (WHERE c) counts the rows where c holds.
            if (value == "*")
                value = "1";
            var condition = Condition(text[(m.Index + m.Length)..filterClose].Trim(), booleanColumns);
            text = $"{text[..(aggOpen + 1)]}{distinct}CASE WHEN {condition} THEN {value} END){text[(filterClose + 1)..]}";
        }
        return text;
    }

    /// A boolean column on its own is a condition in PostgreSQL; in SQL Server it's a bit to compare.
    static string Condition(string condition, IReadOnlySet<string> booleanColumns) =>
        booleanColumns.Contains(condition) ? $"{condition} = 1"
        : NotColumn().Match(condition) is { Success: true } n && booleanColumns.Contains(n.Groups[1].Value) ? $"{n.Groups[1].Value} = 0"
        : condition;

    static string? Extract(string field, string source) => field.ToLowerInvariant() switch
    {
        // ISO day of week, 1 = Monday ... 7 = Sunday, whatever SET DATEFIRST is.
        "isodow" => $"((DATEPART(weekday, {source.Trim()}) + @@DATEFIRST + 5) % 7 + 1)",
        "hour" or "minute" or "second" or "day" or "month" or "year" or "quarter" or "week" or "doy" =>
            $"DATEPART({(field.Equals("doy", StringComparison.OrdinalIgnoreCase) ? "dayofyear" : field.ToLowerInvariant())}, {source.Trim()})",
        _ => null,
    };

    /// Replaces each name(...) call that convert can rewrite (it gets the text inside the parentheses).
    static string Calls(string text, string name, Func<string, string?> convert)
    {
        var from = 0;
        while (Regex.Match(text[from..], $@"\b{name}\s*\(", RegexOptions.IgnoreCase) is { Success: true } m)
        {
            var open = from + m.Index + m.Length - 1;
            var close = CloseOf(text, open);
            if (close < 0)
                break;
            if (convert(text[(open + 1)..close]) is { } replaced)
            {
                text = text[..(from + m.Index)] + replaced + text[(close + 1)..];
                from += m.Index + replaced.Length;
            }
            else
            {
                from = close + 1;
            }
        }
        return text;
    }

    /// x::int -> CAST(x AS int), where x is a name or a call such as DATEPART(...) right before the ::.
    static string Casts(string text)
    {
        while (Cast().Match(text) is { Success: true } m)
        {
            var end = m.Index;
            var start = end;
            if (start > 0 && text[start - 1] == ')')
            {
                start = OpenOf(text, start - 1);
                if (start < 0)
                    break;
            }
            while (start > 0 && (char.IsLetterOrDigit(text[start - 1]) || text[start - 1] is '_' or '.' or '@'))
                start--;
            if (start == end)
                break;
            var type = m.Groups[1].Value.ToLowerInvariant() switch
            {
                "int" or "integer" or "int4" => "int",
                "bigint" or "int8" => "bigint",
                "numeric" or "decimal" => "decimal(38, 6)",
                "text" or "varchar" => "varchar(max)",
                "float" or "float8" or "double" => "float",
                var t => t,
            };
            text = $"{text[..start]}CAST({text[start..end]} AS {type}){text[(m.Index + m.Length)..]}";
        }
        return text;
    }

    /// The index of the "(" matching the ")" at close, or -1.
    static int OpenOf(string text, int close)
    {
        var depth = 0;
        for (var i = close; i >= 0; i--)
        {
            if (text[i] == ')')
                depth++;
            else if (text[i] == '(' && --depth == 0)
                return i;
        }
        return -1;
    }

    /// The index of the ")" matching the "(" at open, or -1.
    static int CloseOf(string text, int open)
    {
        var depth = 0;
        for (var i = open; i < text.Length; i++)
        {
            if (text[i] == '(')
                depth++;
            else if (text[i] == ')' && --depth == 0)
                return i;
        }
        return -1;
    }

    // The ")" closing an aggregate, then FILTER (WHERE; group 1 is FILTER's "(".
    [GeneratedRegex(@"\)\s*FILTER\s*(\()\s*WHERE\s+", RegexOptions.IgnoreCase)]
    private static partial Regex Filter();

    [GeneratedRegex(@"^DISTINCT\s+", RegexOptions.IgnoreCase)]
    private static partial Regex DistinctPrefix();

    [GeneratedRegex(@"^NOT\s+(\w+)$", RegexOptions.IgnoreCase)]
    private static partial Regex NotColumn();

    [GeneratedRegex(@"^\s*(\w+)\s+FROM\s+(.+)$", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex FieldFrom();

    [GeneratedRegex(@"^(.+),\s*'FMDay'\s*$", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex FmDay();

    [GeneratedRegex(@"::\s*(\w+)")]
    private static partial Regex Cast();

    [GeneratedRegex(@"\bILIKE\b", RegexOptions.IgnoreCase)]
    private static partial Regex Ilike();
}
