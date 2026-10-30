namespace Insights.AiHub.Services.Routing;

/// System prompt and structured-output schema for telling questions about the data from questions about the database.
static class IntentPrompt
{
    public static string System(ServiceProfile? analytics, ServiceProfile? dbGuide) => $"""
        You route questions asked in the SEH Intelligence Platform's Insights Assistant to the service that can answer
        them. Classify the latest question as exactly one of:

        - "analytics": a question about what happened in the business, answered by running a query on the sales data
          ({analytics?.Name ?? "point-of-sale baskets"}): figures, totals, counts, averages, rankings, trends over time,
          comparisons between stores, items, offers, payment types, days or hours, and which items are bought together.
          Questions it answers:
        {Examples(analytics)}
        - "db-guide": a question about the structure of the {dbGuide?.Name ?? "retail"} database itself, answered from its
          catalog, never from its data: which table or column holds something, what a column means, how tables join,
          keys, constraints, triggers, which columns are sensitive, or how to write a query against it.
          Questions it answers:
        {Examples(dbGuide)}
        - "unclear": anything else: greetings, small talk, questions about neither the sales data nor the database, or
          too vague to tell which of the two is meant.

        Rules:
        - Asking for actual figures or rows is "analytics", even when it names a table. Asking where data is stored, what
          it means or how to query it is "db-guide".
        - Earlier questions may come first, with the intent each was given. A follow-up such as "and by store?" or
          "what about its key?" continues the earlier question's intent unless it clearly changes subject.
        - reason: one short sentence, for the user, saying what the question is about. For "unclear", say what is
          missing or what they could ask instead.
        - board: the capability board an "analytics" answer belongs on:
          "basket-intelligence" for baskets, items, products bought together, stores, sales, offers and payments;
          "fresh-food-forecasting" for fresh food demand, waste, stock-outs and forecasts;
          "revenue-opportunities" for growth, gaps against comparable stores and revenue potential;
          "none" for "db-guide" and "unclear" questions, or when no board fits.
        """;

    static string Examples(ServiceProfile? profile) =>
        profile is { Suggestions.Count: > 0 }
            ? string.Join('\n', profile.Suggestions.Take(8).Select(s => $"    - {s}"))
            : "    (no examples available)";

    public const string ResponseSchema = """
        {
          "type": "object",
          "properties": {
            "intent": { "type": "string", "enum": ["analytics", "db-guide", "unclear"] },
            "reason": { "type": "string" },
            "board": { "type": "string", "enum": ["basket-intelligence", "fresh-food-forecasting", "revenue-opportunities", "none"] }
          },
          "required": ["intent", "reason", "board"],
          "additionalProperties": false
        }
        """;
}
