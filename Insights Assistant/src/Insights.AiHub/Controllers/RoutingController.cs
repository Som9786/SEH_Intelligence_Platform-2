using System.Text.Json;
using Insights.AiHub.Filters;
using Insights.AiHub.Models;
using Insights.AiHub.Services.Routing;
using Insights.Common;
using Microsoft.AspNetCore.Mvc;

namespace Insights.AiHub.Controllers;

[ApiController]
[UpstreamErrorFilter]
public sealed class RoutingController(IntentService intentService, AskRouter router, ServiceProfiles profiles, FollowUpService followUps)
    : ControllerBase
{
    /// Question -> its intent: "analytics" (about the sales data), "db-guide" (about the database's structure) or "unclear".
    [HttpPost("intent")]
    [ProducesResponseType<IntentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<IntentResponse>> Intent(RouteRequest request, CancellationToken ct)
    {
        if (QuestionRules.Problem(request.Question) is { } problem)
            return Problem(problem, statusCode: StatusCodes.Status400BadRequest);
        return Ok(await intentService.ClassifyAsync(request, ct));
    }

    /// Question -> its intent, then the answer from the service for it (Analytics or DB Guide POST /ask), passed through in
    /// Result. An unclear question calls neither and says what to ask instead. When the service fails, its own error
    /// response is passed on, with the intent in the X-Intent header.
    [HttpPost("ask")]
    [ProducesResponseType<RoutedAnswer>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Ask(RouteRequest request, CancellationToken ct)
    {
        if (QuestionRules.Problem(request.Question) is { } problem)
            return Problem(problem, statusCode: StatusCodes.Status400BadRequest);
        var intent = await intentService.ClassifyAsync(request, ct);
        if (intent.Intent is not (Intents.Analytics or Intents.DbGuide))
            return Ok(new RoutedAnswer(request.Question, Intents.Unclear, intent.Reason, Boards.None, null, null,
                await UnclearMessageAsync(intent.Reason, ct), intent.Usage, intent.Cached));

        Response.Headers["X-Intent"] = intent.Intent;
        var name = intent.Intent == Intents.Analytics ? "Analytics" : "DB Guide";
        ServiceReply reply;
        try
        {
            reply = await router.AskAsync(intent.Intent, request, ct);
        }
        catch (HttpRequestException e)
        {
            return Problem($"The question is for {name}, which is not reachable at {router.AddressOf(intent.Intent)}: {e.Message}",
                title: $"{name} unavailable", statusCode: StatusCodes.Status503ServiceUnavailable);
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return Problem($"{name} did not answer in time (Routing:TimeoutSeconds).",
                title: $"{name} timeout", statusCode: StatusCodes.Status504GatewayTimeout);
        }

        if (reply.Status is < 200 or > 299)
            return new ContentResult { StatusCode = reply.Status, ContentType = reply.ContentType, Content = reply.Body };
        using var result = JsonDocument.Parse(reply.Body);
        // Only answers about the data go on a board.
        var board = intent.Intent == Intents.Analytics ? intent.Board : Boards.None;
        return Ok(new RoutedAnswer(request.Question, intent.Intent, intent.Reason, board, reply.Service, result.RootElement.Clone(),
            null, intent.Usage, intent.Cached));
    }

    /// Question + the answer shown -> up to three questions to ask next. The UI asks for these after showing the answer.
    [HttpPost("follow-ups")]
    [ProducesResponseType<FollowUpResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<FollowUpResponse>> FollowUps(FollowUpRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return Problem("'question' is required.", statusCode: StatusCodes.Status400BadRequest);
        return Ok(await followUps.SuggestAsync(request, ct));
    }

    /// The reason, then one example question for each service.
    async Task<string> UnclearMessageAsync(string reason, CancellationToken ct)
    {
        var data = (await profiles.AnalyticsAsync(ct))?.Suggestions.FirstOrDefault();
        var structure = (await profiles.DbGuideAsync(ct))?.Suggestions.FirstOrDefault();
        var examples = data is null || structure is null
            ? "I can answer questions about the sales data, or about the database's tables, columns and joins."
            : $"I can answer questions about the sales data, such as \"{data}\", or about the database's structure, such as \"{structure}\".";
        return $"{reason} {examples}";
    }
}
