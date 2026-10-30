using Insights.AiHub.Filters;
using Insights.AiHub.Models;
using Insights.AiHub.Services.Routing;
using Insights.Common;
using Microsoft.AspNetCore.Mvc;

namespace Insights.AiHub.Controllers;

/// The model calls behind the gateway's POST /api/ai/ask: which service a question is for, and what to ask next. The
/// gateway asks the service itself and sends what each service answers (RouteRequest.Analytics and DbCatalog), so the AI
/// Hub calls only the model.
[ApiController]
[UpstreamErrorFilter]
public sealed class RoutingController(IntentService intentService, FollowUpService followUps) : ControllerBase
{
    /// Question -> its intent: "analytics" (about the sales data), "db-catalog" (about the database's structure) or "unclear".
    [HttpPost("intent")]
    [ProducesResponseType<IntentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<IntentResponse>> Intent(RouteRequest request, CancellationToken ct)
    {
        if (QuestionRules.Problem(request.Question) is { } problem)
            return Problem(problem, statusCode: StatusCodes.Status400BadRequest);
        return Ok(await intentService.ClassifyAsync(request, ct));
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
}
