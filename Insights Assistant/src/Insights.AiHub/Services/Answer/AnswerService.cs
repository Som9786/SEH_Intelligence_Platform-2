using System.Text.Json;
using Insights.AiHub.Configuration;
using Insights.AiHub.Models;
using Insights.AiHub.Services.Llm;
using Microsoft.Extensions.Options;

namespace Insights.AiHub.Services.Answer;

/// Question + the analytics service's query results -> a plain-English answer. The same question, query and results
/// asked again are answered from the cache without calling the model.
public sealed class AnswerService(
    LlmClient llm, ResponseCache<AnswerResponse> cache, IOptions<AnswerOptions> options, ILogger<AnswerService> logger)
{
    public async Task<AnswerResponse> AnswerAsync(AnswerRequest request, CancellationToken ct)
    {
        var results = request.Results.ValueKind == JsonValueKind.Undefined ? "null" : request.Results.GetRawText();
        var max = options.Value.MaxResultChars;
        logger.LogInformation("Answer step 1/2: explaining {Chars} characters of results for \"{Question}\"", results.Length, request.Question);
        var cacheKey = ResponseCache<AnswerResponse>.KeyOf(ResponseCache<AnswerResponse>.Normalize(request.Question), request.Sql, results);
        if (cache.Get(cacheKey) is { } cached)
        {
            logger.LogInformation("Answer: reusing the answer given earlier for the same question and results (no model call)");
            return cached with { Usage = null, Cached = true };
        }
        if (results.Length > max)
        {
            logger.LogInformation("Answer: results cut to Answer:MaxResultChars ({Max} characters) before sending to the model", max);
            results = results[..max] + "\n[results truncated]";
        }

        List<LlmMessage> messages =
        [
            LlmMessage.System(AnswerPrompt.System),
            LlmMessage.User($"""
                Question: {request.Question}

                Query used: {request.Sql ?? "(not provided)"}

                Results (JSON):
                {results}
                """),
        ];
        logger.LogInformation("Answer step 2/2: asking the model for a plain-English answer");
        var reply = await llm.CompleteAsync(messages, null, ct);
        logger.LogInformation("Answer: the model answered with {Chars} characters", reply.Text.Length);
        var response = new AnswerResponse(reply.Text, reply.Usage);
        cache.Set(cacheKey, response);
        return response;
    }
}
