using System.Text.Json;
using Insights.AiHub.Models;
using Insights.AiHub.Services.Llm;
using OpenAI.Chat;

namespace Insights.AiHub.Services.Guide;

/// Question about a database's structure + the part of its catalog the question is about -> an answer in Markdown and an
/// example query. The caller sends the catalog context; this service never reads a catalog or a database. A plain question
/// (no history) asked again with the same context is answered from the cache without calling OpenAI.
public sealed class GuideService(LlmClient llm, ResponseCache<GuideResponse> cache, ILogger<GuideService> logger)
{
    /// Conversation turns sent with a follow-up; older ones are dropped to keep the prompt small.
    const int MaxHistory = 3;

    public async Task<GuideResponse?> AnswerAsync(GuideRequest request, CancellationToken ct)
    {
        var question = request.Question;
        var history = request.History?.TakeLast(MaxHistory).ToList() ?? [];
        var context = request.Context.ValueKind == JsonValueKind.Undefined ? "{}" : request.Context.GetRawText();
        logger.LogInformation("Guide step 1/2: building the prompt for \"{Question}\"{History} ({Chars} characters of catalog)",
            question, history.Count > 0 ? $" with {history.Count} earlier questions" : "", context.Length);

        // The context is in the key, so a reloaded catalog answers afresh.
        var cacheKey = history.Count == 0 ? ResponseCache<GuideResponse>.KeyOf(context, ResponseCache<GuideResponse>.Normalize(question)) : null;
        if (cacheKey is not null && cache.Get(cacheKey) is { } cached)
        {
            logger.LogInformation("Guide: reusing the answer given earlier for this question (no OpenAI call)");
            return cached with { Usage = null, Cached = true };
        }

        List<ChatMessage> messages = [new SystemChatMessage(GuidePrompt.System(context))];
        foreach (var turn in history)
        {
            messages.Add(new UserChatMessage(turn.Question));
            messages.Add(new AssistantChatMessage(JsonSerializer.Serialize(new { answer = turn.Answer, tables = Array.Empty<string>(), sql = "" })));
        }
        messages.Add(new UserChatMessage(question));
        var options = new ChatCompletionOptions
        {
            ResponseFormat = ChatResponseFormat.CreateJsonSchemaFormat(
                "catalog_answer", BinaryData.FromString(GuidePrompt.ResponseSchema), jsonSchemaIsStrict: true),
        };

        logger.LogInformation("Guide step 2/2: asking the model");
        var reply = await llm.CompleteAsync(messages, options, ct);
        var response = JsonSerializer.Deserialize<GuideResponse>(reply.Text, JsonSerializerOptions.Web) is { } r ? r with { Usage = reply.Usage } : null;
        logger.LogInformation("Guide: the model answered with {Chars} characters, using {Tables}{Sql}",
            response?.Answer.Length, response is null ? "nothing" : string.Join(", ", response.Tables), response?.Sql is { Length: > 0 } ? ", with an example query" : "");
        if (cacheKey is not null && response is not null)
            cache.Set(cacheKey, response);
        return response;
    }
}
