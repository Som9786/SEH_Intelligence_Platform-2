using Insights.DbGuide.Models;
using Insights.DbGuide.Services.AiHub;
using Insights.DbGuide.Services.Catalog;

namespace Insights.DbGuide.Services.Ask;

/// Answers a question about the database: reads the part of the catalog it's about from Neo4j, and has the AI Hub
/// answer from that. Nothing runs on the database itself; an example query in the answer is for the reader to run.
public sealed class AskService(CatalogReader reader, AiHubClient aiHub, ILogger<AskService> logger)
{
    /// Earlier turns sent with a follow-up; older ones are dropped to keep the prompt small.
    const int MaxHistory = 3;

    public async Task<AskResponse> AskAsync(AskRequest request, CancellationToken ct)
    {
        var history = request.History?.TakeLast(MaxHistory).ToList() ?? [];
        logger.LogInformation("Ask step 1/2: reading the catalog for \"{Question}\"{History}", request.Question,
            history.Count > 0 ? $" with {history.Count} earlier questions" : "");
        var context = await reader.GetContextAsync(request.Question, history.Select(h => h.Question).ToList(), ct);

        logger.LogInformation("Ask step 2/2: asking the AI Hub to answer from {Tables} tables", context.Tables.Count);
        var reply = await aiHub.GuideAsync(request.Question, context, history, ct);
        return new AskResponse(request.Question, reply.Answer, reply.Tables, reply.Sql, context.Matched,
            context.Tables.Select(t => t.Id).ToList(), context.JoinPaths, reply.Usage, reply.Cached);
    }
}
