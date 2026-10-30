using System.Diagnostics;
using System.Text.Json;
using Insights.Analytics.Configuration;
using Insights.Analytics.Models;
using Insights.Analytics.Services.AiHub;
using Insights.Analytics.Services.Query;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Insights.Analytics.Services.Ask;

/// Answers a question end to end: the AI Hub writes SQL from the part of the knowledge model the question is about, this
/// service runs it read-only on PostgreSQL, and the AI Hub explains the rows.
/// When PostgreSQL rejects the query, the AI Hub gets the error back once and writes a corrected query.
public sealed class AskService(AiHubClient ai, SqlQueryService queryService, IOptions<QueryOptions> options, ILogger<AskService> logger)
{
    public async Task<AskResponse> AskAsync(AskRequest request, CancellationToken ct)
    {
        var question = request.Question;
        var timer = Stopwatch.StartNew();
        var history = SafeHistory(request.History);
        logger.LogInformation("Ask step 1/3: asking the AI Hub to write SQL for \"{Question}\"", question);
        var generated = await ai.GenerateSqlAsync(new(question, history), ct);
        var usages = new List<LlmUsage?> { generated.Usage };
        if (!generated.Answerable)
        {
            logger.LogInformation("Ask: the AI says the data can't answer this: {Explanation}", generated.Explanation);
            return new(question, false, "", generated.Explanation, null, null, Cost(usages, generated.Cached), KnowledgeModel: generated.KnowledgeModel);
        }

        logger.LogInformation("Ask step 2/3: running the generated query on PostgreSQL");
        QueryResult result;
        var corrected = false;
        try
        {
            result = await RunAsync(generated, ct);
        }
        catch (AskQueryException first)
        {
            logger.LogInformation("Ask: asking the AI Hub to correct the query once");
            generated = await ai.GenerateSqlAsync(new(question, history, generated.Sql, $"{first.Title}: {first.Message}"), ct);
            usages.Add(generated.Usage);
            if (!generated.Answerable)
                throw;
            result = await RunAsync(generated, ct);
            corrected = true;
            logger.LogInformation("Ask: the corrected query worked");
        }
        var fetchedAt = DateTimeOffset.Now;

        if (!request.Explain)
        {
            logger.LogInformation("Ask finished in {Ms} ms with {Rows} rows, not explained (explain = false)", timer.ElapsedMilliseconds, result.Rows.Count);
            return new(question, true, generated.Sql, generated.Explanation, result, null, Cost(usages, generated.Cached), corrected, generated.KnowledgeModel, fetchedAt);
        }

        logger.LogInformation("Ask step 3/3: asking the AI Hub to explain {Rows} rows", result.Rows.Count);
        var results = JsonSerializer.SerializeToElement(result, JsonSerializerOptions.Web);
        var answer = await ai.AnswerAsync(new(question, generated.Sql, results), ct);
        usages.Add(answer.Usage);
        logger.LogInformation("Ask finished in {Ms} ms", timer.ElapsedMilliseconds);
        return new(question, true, generated.Sql, generated.Explanation, result, answer.Answer,
            Cost(usages, generated.Cached && answer.Cached), corrected, generated.KnowledgeModel, fetchedAt);
    }

    /// The history comes from the client, so an earlier query the guard would refuse to run isn't shown to the AI as an
    /// example to build on: that turn is left out.
    List<ConversationTurn> SafeHistory(IReadOnlyList<ConversationTurn>? history)
    {
        var turns = history ?? [];
        var safe = turns.Where(t => SqlGuard.RejectionReason(t.Sql, queryService.Tables) is null).ToList();
        if (safe.Count < turns.Count)
            logger.LogWarning("Ask: left out {Count} earlier turns whose query the guard refuses", turns.Count - safe.Count);
        return safe;
    }

    async Task<QueryResult> RunAsync(SqlResponse generated, CancellationToken ct)
    {
        try
        {
            return await queryService.RunReadOnlyAsync(generated.Sql, ct);
        }
        catch (QueryRejectedException e)
        {
            logger.LogWarning("Ask: the generated query was rejected: {Message}", e.Message);
            throw new AskQueryException("Query rejected", e.Message, generated.Sql, generated.Explanation);
        }
        catch (PostgresException e)
        {
            var (title, detail) = PostgresErrors.Describe(e, options.Value.TimeoutSeconds);
            logger.LogWarning("Ask: the generated query failed in PostgreSQL ({Title}): {Detail}", title, detail);
            throw new AskQueryException(title, detail, generated.Sql, generated.Explanation);
        }
    }

    /// The question's OpenAI cost: 0 when every reply came from the cache, null when a call's cost is unknown.
    static decimal? Cost(List<LlmUsage?> usages, bool allCached) =>
        allCached ? 0 : usages.Aggregate((decimal?)0, (sum, u) => u is null ? sum : sum + u.CostUsd);
}
