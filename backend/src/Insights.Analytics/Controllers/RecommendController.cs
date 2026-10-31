using Insights.Analytics.Filters;
using Insights.Analytics.Models;
using Insights.Analytics.Services.Ask;
using Insights.Common;
using Microsoft.AspNetCore.Mvc;

namespace Insights.Analytics.Controllers;

[ApiController]
[Route("recommend")]
[AiHubErrorFilter]
public sealed class RecommendController(RecommendService recommendService) : ControllerBase
{
    /// An answer from POST /ask -> a baseline query that sets its rows against the chain average and the previous period
    /// -> up to three actions (AI Hub). The UI asks for these after showing the answer, so they never delay it.
    [HttpPost]
    [ProducesResponseType<RecommendResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<RecommendResponse>> Recommend(RecommendRequest request, CancellationToken ct)
    {
        if (QuestionRules.Problem(request.Question) is { } problem)
            return Problem(problem, statusCode: StatusCodes.Status400BadRequest);
        return Ok(await recommendService.RecommendAsync(request, ct));
    }
}
