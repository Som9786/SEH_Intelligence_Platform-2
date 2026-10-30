using System.Text.Json;
using Insights.AiHub.Models;
using Insights.AiHub.Services.Llm;
using Insights.AiHub.Services.KnowledgeModel;
using OpenAI.Chat;

namespace Insights.AiHub.Services.Sql;

/// Question in English -> one read-only PostgreSQL query for the analytics service's /query endpoint, written from the
/// part of the knowledge model the question is about. Earlier turns of the conversation go along as chat history, and a query
/// PostgreSQL rejected goes back with its error so the model can correct it. A plain question (no history, no
/// correction) asked again with the same knowledge model context is answered from the cache without calling OpenAI.
public sealed class SqlGenerationService(
    KnowledgeModelClient knowledgeModel, LlmClient llm, ResponseCache<SqlResponse> cache, ILogger<SqlGenerationService> logger)
{
    /// Conversation turns sent with a follow-up; older ones are dropped to keep the prompt small.
    const int MaxHistory = 3;

    public async Task<SqlResponse?> GenerateAsync(SqlRequest request, CancellationToken ct)
    {
        var question = request.Question;
        var history = request.History?.TakeLast(MaxHistory).ToList() ?? [];
        var fixing = !string.IsNullOrWhiteSpace(request.FailedSql);
        logger.LogInformation("SQL step 1/2: building the prompt for \"{Question}\"{History}{Fix}", question,
            history.Count > 0 ? $" with {history.Count} earlier questions" : "", fixing ? ", to correct a query PostgreSQL rejected" : "");
        var context = await knowledgeModel.GetContextAsync(question, history.Select(h => h.Question).ToList(), ct);
        var used = KnowledgeModelClient.Names(context);

        // The context is in the key, so a changed knowledge model (or new days of data) writes the query afresh.
        var cacheKey = history.Count == 0 && !fixing ? ResponseCache<SqlResponse>.KeyOf(context, ResponseCache<SqlResponse>.Normalize(question)) : null;
        if (cacheKey is not null && cache.Get(cacheKey) is { } cached)
        {
            logger.LogInformation("SQL: reusing the query written earlier for this question (no OpenAI call)");
            return cached with { Usage = null, Cached = true };
        }

        List<ChatMessage> messages = [new SystemChatMessage(SqlPrompt.System(context))];
        foreach (var turn in history)
        {
            messages.Add(new UserChatMessage(turn.Question));
            messages.Add(new AssistantChatMessage(Reply(true, turn.Sql, "")));
        }
        messages.Add(new UserChatMessage(question));
        if (fixing)
        {
            messages.Add(new AssistantChatMessage(Reply(true, request.FailedSql!, "")));
            messages.Add(new UserChatMessage($"""
                PostgreSQL rejected that query with this error:
                {request.Error}

                Write a corrected query for the same question, following the same rules.
                """));
        }
        var options = new ChatCompletionOptions
        {
            ResponseFormat = ChatResponseFormat.CreateJsonSchemaFormat(
                "sql_query", BinaryData.FromString(SqlPrompt.ResponseSchema), jsonSchemaIsStrict: true),
        };

        logger.LogInformation("SQL step 2/2: asking the model for a query (knowledge model context {Chars} characters)", context.Length);
        var reply = await llm.CompleteAsync(messages, options, ct);
        var response = JsonSerializer.Deserialize<SqlResponse>(reply.Text, JsonSerializerOptions.Web) is { } r
            ? r with { Usage = reply.Usage, KnowledgeModel = used } : null;
        if (response is { Answerable: true })
            logger.LogInformation("SQL: the model wrote: {Sql}", response.Sql);
        else
            logger.LogInformation("SQL: the model says the data can't answer this: {Explanation}", response?.Explanation);
        if (cacheKey is not null && response is not null)
            cache.Set(cacheKey, response);
        return response;
    }

    /// An earlier reply in the model's own JSON format, so the history reads like its past answers.
    static string Reply(bool answerable, string sql, string explanation) =>
        JsonSerializer.Serialize(new { answerable, sql, explanation });
}
