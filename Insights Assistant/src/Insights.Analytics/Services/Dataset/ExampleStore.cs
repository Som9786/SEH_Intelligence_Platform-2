using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using Insights.Analytics.Configuration;
using Insights.Analytics.Models;
using Insights.Analytics.Services.Query;
using Microsoft.Extensions.Options;

namespace Insights.Analytics.Services.Dataset;

/// Adds and removes verified example queries in query-examples.json. Writing the file makes configuration reload it,
/// and KnowledgeModelWatcher then reloads the knowledge model into Neo4j, so the AI sees a saved example on the next question.
public sealed class ExampleStore(IOptionsMonitor<DatasetOptions> dataset, IHostEnvironment env, ILogger<ExampleStore> logger)
{
    const string Header = """
        // Verified example questions with their correct SQL. They're loaded into the Neo4j knowledge model with knowledge-model.json, and the
        // AI gets the examples about the same concepts and metrics as its question, reusing their patterns. A few good
        // examples improve answers more than anything else.
        //
        // Edit this file freely: changes apply without a restart.
        // The Q&A page's "Save as example" button adds to this file too (it rewrites the file and keeps this header).
        """;

    // Relaxed escaping keeps SQL readable in the file ('>' and quotes stay as they are, not >). PostgreSQL
    // examples have no Dialect.
    static readonly JsonSerializerOptions FileJson = new()
    {
        WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    readonly Lock gate = new();
    readonly string path = Path.Combine(env.ContentRootPath, DatasetOptions.ExamplesFileName);

    public IReadOnlyList<ExampleQuery> All() =>
        dataset.CurrentValue.Examples.Select(e => new ExampleQuery(e.Question, e.Sql, e.Dialect)).ToList();

    /// Adds the example, or replaces the query of an example with the same question in the same dialect (the one the
    /// query ran in), so the PostgreSQL and SQL Server versions of a question are kept apart. Returns the examples as
    /// written, since configuration reloads the file a moment later.
    public IReadOnlyList<ExampleQuery> Save(string question, string sql, SqlDialect dialect)
    {
        List<ExampleQuery> examples;
        lock (gate)
        {
            var example = new ExampleQuery(question.Trim(), sql.Trim(), DialectName(dialect));
            examples = All().Where(e => !Same(e, question, dialect)).Append(example).ToList();
            Write(examples);
        }
        logger.LogInformation("Examples: saved \"{Question}\" ({Dialect}) to {File}", question, dialect, DatasetOptions.ExamplesFileName);
        return examples;
    }

    /// Removes the example with this question in this dialect; false when there is none.
    public bool Remove(string question, SqlDialect dialect)
    {
        lock (gate)
        {
            var examples = All().ToList();
            if (examples.RemoveAll(e => Same(e, question, dialect)) == 0)
                return false;
            Write(examples);
        }
        logger.LogInformation("Examples: removed \"{Question}\" ({Dialect}) from {File}", question, dialect, DatasetOptions.ExamplesFileName);
        return true;
    }

    /// "SQL Server" for SQL Server; null for PostgreSQL, which the knowledge model's files are written in.
    static string? DialectName(SqlDialect dialect) => dialect == SqlDialect.SqlServer ? "SQL Server" : null;

    static bool Same(ExampleQuery e, string question, SqlDialect dialect) =>
        string.Equals(e.Question.Trim(), question.Trim(), StringComparison.OrdinalIgnoreCase)
        && string.Equals(e.Dialect, DialectName(dialect), StringComparison.OrdinalIgnoreCase);

    void Write(List<ExampleQuery> examples)
    {
        var json = JsonSerializer.Serialize(new { Dataset = new { Examples = examples } }, FileJson);
        // The header goes after the opening brace, where the configuration reader accepts comments.
        var body = "{\n" + string.Join("\n", Header.Split('\n').Select(l => "  " + l.TrimEnd())) + json[1..];
        File.WriteAllText(path, body);
    }
}
