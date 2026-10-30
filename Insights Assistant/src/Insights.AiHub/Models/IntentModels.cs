using System.Text.Json;

namespace Insights.AiHub.Models;

/// The kinds of question POST /intent tells apart.
public static class Intents
{
    /// About what happened in the business: answered by Analytics with a query on the sales data.
    public const string Analytics = "analytics";
    /// About a database's structure (tables, columns, joins): answered by DB Guide from the catalog.
    public const string DbGuide = "db-guide";
    /// Neither, or too vague to tell: nothing is called.
    public const string Unclear = "unclear";
}

/// The capability boards an answer can be added to as a widget, matching the UI's pages.
public static class Boards
{
    public const string Basket = "basket-intelligence";
    public const string FreshFood = "fresh-food-forecasting";
    public const string Revenue = "revenue-opportunities";
    public const string None = "none";
}

/// The chart a question asks its answer to be drawn as, matching the UI's chart kinds. "chart" is a chart asked for
/// without naming one; "none" is no chart asked for, so the UI picks one from the rows. Whether the rows suit it is
/// for the UI to tell, since the question is classified before it is answered.
public static class Charts
{
    public const string None = "none";
}

/// Body of POST /intent and POST /ask. History holds the conversation's earlier turns, oldest first.
public sealed record RouteRequest(string Question, IReadOnlyList<RouteTurn>? History = null);

/// One earlier turn: its question, the intent it was given, and what answered it: Sql from Analytics, Answer from DB Guide.
/// Each service is sent only its own earlier turns, as its follow-up history.
public sealed record RouteTurn(string Question, string? Intent = null, string? Answer = null, string? Sql = null);

/// Response of POST /intent. Reason is one sentence a user can read. Board is the capability board the answer belongs on
/// (a Boards value; "none" for questions about the database or that fit no board). Usage is the model call's tokens and
/// cost; null with Cached = true when the same question was classified before. Chart is the chart the question asks
/// for (see Charts).
public sealed record IntentResponse(
    string Intent, string Reason, string Board = Boards.None, LlmUsage? Usage = null, bool Cached = false,
    string Chart = Charts.None);

/// Response of POST /ask. Service is the service that answered ("analytics" or "db-guide") and Result its own POST /ask
/// response, passed through as it is. For an unclear question both are null and Message says what to ask instead. Board
/// is the capability board the answer can be added to, and Chart the chart the question asks for ("none" unless it is
/// about the data; see IntentResponse).
public sealed record RoutedAnswer(
    string Question, string Intent, string Reason, string Board, string? Service, JsonElement? Result, string? Message,
    LlmUsage? IntentUsage, bool IntentCached, string Chart = Charts.None);

/// Body of POST /follow-ups: the question, the intent it was given, and the answer shown (the answer text, plus the
/// result's column names for Analytics).
public sealed record FollowUpRequest(string Question, string? Intent, string? Answer, IReadOnlyList<string>? Columns = null);

/// Response of POST /follow-ups: up to three questions to ask next.
public sealed record FollowUpResponse(IReadOnlyList<string> Questions, LlmUsage? Usage = null, bool Cached = false);
