using System.Text.Json;

namespace Insights.Gateway.Workspace;

/// How often a schedule repeats.
public static class Frequencies
{
    public const string Daily = "daily";
    public const string Weekly = "weekly";
    public const string Monthly = "monthly";
    public const string Quarterly = "quarterly";

    public static readonly string[] All = [Daily, Weekly, Monthly, Quarterly];
}

/// The capability boards a widget can be on, matching the UI's pages.
public static class Boards
{
    public static readonly string[] All = ["basket-intelligence", "fresh-food-forecasting", "revenue-opportunities"];
}

/// The ways the UI can draw a widget's rows, when the question asked for one (otherwise it picks from their shape).
public static class Charts
{
    public static readonly string[] All =
        ["kpi", "line", "area", "columns", "bars", "grouped", "stacked", "pie", "share", "scatter", "heatmap", "table"];
}

/// A question to ask again on a schedule. Time is "HH:mm" and StartsOn "yyyy-MM-dd", in the server's time zone.
/// DayOfWeek (0 = Sunday) is for weekly schedules; DayOfMonth (1-28) for monthly and quarterly ones, which repeat every
/// three months from the month they start. Answer is the answer shown when it was scheduled.
public sealed record Schedule(
    string Id, string Name, string Question, string Frequency, string Time, string StartsOn, int? DayOfWeek,
    int? DayOfMonth, bool Enabled, string? Board, string? Answer, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

/// Body of POST /schedules and PUT /schedules/{id}.
public sealed record ScheduleInput(
    string? Name, string? Question, string? Frequency, string? Time, string? StartsOn, int? DayOfWeek, int? DayOfMonth,
    bool? Enabled, string? Board, string? Answer);

/// A schedule as returned: with when it would next run (null when paused). Schedules aren't run yet.
public sealed record ScheduleView(Schedule Schedule, DateTimeOffset? NextRunAt);

/// How an answer was reached, from Analytics' reply: the query that was run, what it does in AI Hub's words, the
/// knowledge model concepts the question matched, and whether the first query failed and was corrected.
public sealed record AnswerDetails(string? Sql, string? Explanation, string[]? KnowledgeModel, bool? Corrected);

/// An answer kept on a capability board. Result is Analytics' result ({ columns, rows, truncated }) as it was shown;
/// FetchedAt is when those rows were read from the database (null for widgets saved before it was recorded); Details
/// is how the answer was reached (null for widgets saved before it was kept, until they are refreshed); Chart is how its
/// rows are drawn (one of Charts.All), or null for the UI to pick.
public sealed record Widget(
    string Id, string Board, string Title, string Question, string? Answer, JsonElement? Result, DateTimeOffset CreatedAt,
    DateTimeOffset? FetchedAt = null, AnswerDetails? Details = null, string? Chart = null);

/// Body of POST /widgets.
public sealed record WidgetInput(
    string? Board, string? Title, string? Question, string? Answer, JsonElement? Result, DateTimeOffset? FetchedAt = null,
    AnswerDetails? Details = null, string? Chart = null);

/// Body of PUT /widgets/{id}: the question answered again.
public sealed record WidgetRefresh(string? Answer, JsonElement? Result, DateTimeOffset? FetchedAt, AnswerDetails? Details = null);

/// An insight shared by link: a copy of a widget as it was when shared, which anyone signed in can open until ExpiresAt.
/// Later refreshes or removing the widget don't change it. The query isn't copied (Details.Sql is null): a shared
/// report shows the answer and data, not how the database is built.
public sealed record SharedInsight(
    string Id, string Board, string Title, string Question, string? Answer, JsonElement? Result, AnswerDetails? Details,
    DateTimeOffset? FetchedAt, string SharedBy, DateTimeOffset SharedAt, DateTimeOffset? ExpiresAt = null, string? Chart = null);

/// Body of POST /shares: the signed-in user's widget to share.
public sealed record ShareInput(string? WidgetId);

/// Body of PUT /widgets/order: a board's widget ids in the order the user arranged them.
public sealed record WidgetOrderInput(string? Board, string[]? Ids);

/// Everything one user has saved: one file per user.
public sealed class UserWorkspace
{
    public List<Schedule> Schedules { get; set; } = [];
    public List<Widget> Widgets { get; set; } = [];
    /// Each board's widget ids as the user arranged them. Widgets not in it (added since) come first, newest first.
    public Dictionary<string, List<string>> WidgetOrder { get; set; } = [];
}
