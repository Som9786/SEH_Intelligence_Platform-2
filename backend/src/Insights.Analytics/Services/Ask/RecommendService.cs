using System.Text.Json;
using Insights.Analytics.Models;
using Insights.Analytics.Services.AiHub;
using Insights.Analytics.Services.KnowledgeModel;

namespace Insights.Analytics.Services.Ask;

/// An answer -> what to do about it. A ranking or a trend alone says nothing about whether it's good or bad, so this first
/// asks for a baseline: the same measure next to the chain average and the previous period, written as a follow-up to the
/// answer's own query and run like any other question. Then the AI Hub suggests actions from both, knowing the dates the
/// data covers and the question's business rules. When the baseline can't be run, the actions come from the rows alone.
public sealed class RecommendService(AskService ask, AiHubClient ai, KnowledgeModelReader knowledgeModel, ILogger<RecommendService> logger)
{
    /// Fewer rows than this have nothing to compare (a single total), so no model is asked.
    const int MinRows = 2;

    const string BaselineQuestion = """
        Put the previous answer's rows against a benchmark, so it shows which of them are well above or below normal.
        Keep the same rows and their measure, and add next to each: the same measure across all stores, items or days as
        an average per row (or the overall share, for a share), and the gap to it in percent. Where the data has at least
        two weeks, also add the measure for the previous period of the same length, and the change in percent.
        """;

    public async Task<RecommendResponse> RecommendAsync(RecommendRequest request, CancellationToken ct)
    {
        if (request.Result is not { } result || result.Rows.Count < MinRows || string.IsNullOrWhiteSpace(request.Sql))
        {
            logger.LogInformation("Recommend: too few rows for \"{Question}\", so no actions", request.Question);
            return new([], null, null, 0);
        }

        logger.LogInformation("Recommend step 1/2: asking for a baseline for \"{Question}\"", request.Question);
        AskResponse? baseline = null;
        try
        {
            baseline = await ask.AskAsync(new(BaselineQuestion, [new(request.Question, request.Sql)], Explain: false), ct);
            if (!baseline.Answerable || baseline.Result is not { Rows.Count: > 0 })
            {
                logger.LogInformation("Recommend: no baseline for this answer: {Explanation}", baseline.Explanation);
                baseline = baseline with { Result = null };
            }
        }
        catch (AskQueryException e)
        {
            logger.LogWarning("Recommend: the baseline query failed ({Title}), so the actions come from the rows alone", e.Title);
        }

        var context = await knowledgeModel.GetContextAsync(new ContextRequest(request.Question), ct);
        logger.LogInformation("Recommend step 2/2: asking the AI Hub for actions");
        var reply = await ai.RecommendAsync(new(
            request.Question,
            request.Answer,
            JsonSerializer.SerializeToElement(result, JsonSerializerOptions.Web),
            baseline?.Result is { } rows ? JsonSerializer.SerializeToElement(rows, JsonSerializerOptions.Web) : null,
            context.Coverage?.From,
            context.Coverage?.To,
            context.Rules), ct);

        var cost = reply.Cached ? 0 : reply.Usage?.CostUsd;
        if (baseline is not null)
            cost = cost is null || baseline.CostUsd is null ? null : cost + baseline.CostUsd;
        return new(reply.Recommendations, reply.DataNote, baseline?.Result is null ? null : baseline.Sql, cost);
    }
}
