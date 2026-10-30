namespace Insights.Contracts;

/// The kinds of question the AI Hub's POST /intent tells apart.
public static class Intents
{
    /// About what happened in the business: answered by Analytics with a query on the sales data.
    public const string Analytics = "analytics";
    /// About a database's structure (tables, columns, joins): answered by DB Catalog from the catalog.
    public const string DbCatalog = "db-catalog";
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

/// A service's own description of what it answers: its name and suggested questions (Analytics' GET /dataset, DB Catalog's
/// GET /guide). Used as examples when classifying a question or suggesting the next one.
public sealed record ServiceProfile(string Name, IReadOnlyList<string> Suggestions);

/// Body of the AI Hub's POST /intent, and of the gateway's POST /api/ai/ask. History holds the conversation's earlier turns, oldest first. Analytics and DbCatalog are what
/// each service says it answers, sent by the caller (the gateway) so the AI Hub never calls them; without them the
/// question is classified from the built-in descriptions alone.
public sealed record RouteRequest(string Question, IReadOnlyList<RouteTurn>? History = null,
    ServiceProfile? Analytics = null, ServiceProfile? DbCatalog = null);

/// One earlier turn: its question, the intent it was given, and what answered it: Sql from Analytics, Answer from DB Catalog.
/// Each service is sent only its own earlier turns, as its follow-up history.
public sealed record RouteTurn(string Question, string? Intent = null, string? Answer = null, string? Sql = null);

/// Response of POST /intent. Reason is one sentence a user can read. Board is the capability board the answer belongs on
/// (a Boards value; "none" for questions about the database or that fit no board). Usage is the model call's tokens and
/// cost; null with Cached = true when the same question was classified before. Chart is the chart the question asks
/// for (see Charts).
public sealed record IntentResponse(
    string Intent, string Reason, string Board = Boards.None, LlmUsage? Usage = null, bool Cached = false,
    string Chart = Charts.None);

/// Body of POST /follow-ups: the question, the intent it was given, and the answer shown (the answer text, plus the
/// result's column names for Analytics). Analytics and DbCatalog are as for POST /intent.
public sealed record FollowUpRequest(string Question, string? Intent, string? Answer, IReadOnlyList<string>? Columns = null,
    ServiceProfile? Analytics = null, ServiceProfile? DbCatalog = null);

/// Response of POST /follow-ups: up to three questions to ask next.
public sealed record FollowUpResponse(IReadOnlyList<string> Questions, LlmUsage? Usage = null, bool Cached = false);
