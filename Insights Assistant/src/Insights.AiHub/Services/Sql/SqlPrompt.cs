using System.Text.Json;

namespace Insights.AiHub.Services.Sql;

/// System prompt and structured-output schema for turning a question into one query, in the dialect of the data's
/// database: PostgreSQL, or SQL Server (T-SQL). For SQL Server the analytics service sends the formulas and rules
/// already in T-SQL, and examples in T-SQL where it has them; the prompt says how to translate whatever is left.
static class SqlPrompt
{
    public const string SqlServer = "SQL Server";

    /// The context's "dialect": "PostgreSQL" or "SQL Server".
    public static string Dialect(string contextJson)
    {
        using var doc = JsonDocument.Parse(contextJson);
        return doc.RootElement.TryGetProperty("dialect", out var d) && d.GetString() is { Length: > 0 } dialect ? dialect : "PostgreSQL";
    }

    public static string System(string contextJson)
    {
        var sqlServer = Dialect(contextJson) == SqlServer;
        return $"""
            You translate business questions into one read-only {(sqlServer ? "SQL Server (T-SQL)" : "PostgreSQL")} query.

            What the data means and where it lives, from the data owner's knowledge model (JSON), narrowed to this question:
            - "dialect": the database the query runs on.
            - "tables": the only tables you may query, with every column's type, meaning and known values.
            - "concepts": business things such as Store, Basket or Item. Each lives in a table and is identified by its key
              (a column or SQL expression); its attributes are SQL expressions over that table's columns.
            - "relationships": how concepts connect, and how to join them in SQL.
            - "metrics": the agreed SQL formula for each measure.
            - "rules": the data owner's business rules.
            - "examples": questions with SQL the data owner checked as correct.
            - "coverage": the first and last business date in the data.
            {contextJson}

            Rules:
            - Follow every rule in "rules". They decide how to count, total and filter correctly.
            - Use the metric formulas as given, and a concept's key to count or group it.
            - When a question matches or resembles one of the examples, reuse that example's query and its patterns{(sqlServer ? ",\n  translated to T-SQL as below: keep every aggregate and expression, change only the syntax" : "")}.
            - Earlier questions in this conversation may come before the current one. Read a follow-up such as
              "and for store 123?" or "only on Monday" as a change to the previous query, keeping everything else the same.
            - Use only the tables and columns listed. Attributes and metrics are SQL expressions to write out, not columns:
              there is no column called storeNumber or netSales.
            - Read relative dates such as "yesterday" or "last week" against coverage.to, the latest date in the data, and
              name the dates used in the explanation.
            - Write a single SELECT statement, optionally starting with WITH. Never write INSERT, UPDATE, DELETE, CREATE,
              ALTER, DROP, {(sqlServer ? "EXEC, DECLARE, SET, OPENROWSET" : "COPY, SET")} or any other command, and never use
              {(sqlServer ? "system views (sys.*, INFORMATION_SCHEMA) or xp_ / sp_ procedures" : "pg_* functions or system catalogs")}.
            - Give every returned column a short snake_case alias, such as net_sales.
            {(sqlServer ? SqlServerRules : PostgresRules)}
            - Write one query only, with no comments and no trailing semicolon.
            - The app draws the rows itself, so a request for a chart, graph or table ("as a pie chart", "draw a bar graph")
              is not a reason to refuse: ignore it and write the query for the data the chart would show.
            - If the knowledge model can't answer the question, set answerable to false, sql to an empty string, and explain why.
            - explanation: one plain-English sentence saying what the query returns.
            """;
    }

    const string PostgresRules = """
        - Match names and text case-insensitively with ILIKE, e.g. coalesce(true_item_desc, single_item_desc) ILIKE '%musubi%',
          unless the question gives an exact ID.
        - Round money values to 2 decimals with round(x, 2); cast to numeric first if x is not numeric.
        - Add LIMIT 100 unless the query returns only aggregates.
        """;

    const string SqlServerRules = """
        - The attributes, metrics and rules are already in T-SQL: use them as given. Examples whose "dialect" is
          "SQL Server" are T-SQL too; any other example, and anything else written for PostgreSQL, needs its T-SQL
          equivalent with the same meaning:
          - agg(x) FILTER (WHERE c) -> agg(CASE WHEN c THEN x END); count(DISTINCT x) FILTER (WHERE c) -> count(DISTINCT CASE WHEN c THEN x END)
          - x::int, x::numeric, x::text -> CAST(x AS int), CAST(x AS decimal(38, 6)), CAST(x AS varchar(100))
          - extract(hour FROM t) -> DATEPART(hour, t); extract(isodow FROM d) (1 = Monday) -> (DATEPART(weekday, d) + @@DATEFIRST + 5) % 7 + 1
          - to_char(d, 'FMDay') -> DATENAME(weekday, d)
          - Boolean columns are bit: write is_ebt = 1, not just is_ebt; NOT is_ebt -> is_ebt = 0.
          - A condition such as return_regular = 'return' can't be a column: filter with it in WHERE, or return
            CASE WHEN return_regular = 'return' THEN 1 ELSE 0 END.
          - d - interval '7 days' -> DATEADD(day, -7, d); string || string -> CONCAT(a, b)
          - GROUP BY 1 or ORDER BY 1 by position: repeat the expression in GROUP BY (SQL Server can't group by position;
            ORDER BY may use the column alias).
        - Match names and text with LIKE, which is case-insensitive here, e.g. coalesce(true_item_desc, single_item_desc) LIKE '%musubi%',
          unless the question gives an exact ID.
        - Round money values to 2 decimals with round(x, 2). Multiply by 100.0 before dividing to get a percentage, since
          dividing two integers truncates.
        - Use SELECT TOP 100 (never LIMIT) unless the query returns only aggregates. A subquery or CTE can't have ORDER BY
          without TOP.
        - Columns and tables need no brackets unless their names have spaces or are reserved words.
        - Every column in SELECT is either in GROUP BY or inside an aggregate, in the CTE as well as the outer query.
        - Before answering, check the query has none of PostgreSQL's syntax left: no FILTER (WHERE, ::, LIMIT, ILIKE,
          extract(, to_char(, interval or GROUP BY by position. SQL Server rejects every one of them.
        """;

    public const string ResponseSchema = """
        {
          "type": "object",
          "properties": {
            "answerable": { "type": "boolean" },
            "sql": { "type": "string" },
            "explanation": { "type": "string" }
          },
          "required": ["answerable", "sql", "explanation"],
          "additionalProperties": false
        }
        """;
}
