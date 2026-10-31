using Insights.AiHub.Filters;
using Insights.AiHub.Services.Answer;
using Microsoft.AspNetCore.Mvc;

namespace Insights.AiHub.Controllers;

[ApiController]
[Route("recommendations")]
[UpstreamErrorFilter]
public sealed class RecommendationController(RecommendationService recommendations) : ControllerBase
{
    /// Question + the answer shown + its query results -> up to three actions. The UI asks for these after showing the answer.
    [HttpPost]
    [ProducesResponseType<RecommendationResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<RecommendationResponse>> Recommend(RecommendationRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return Problem("'question' is required.", statusCode: StatusCodes.Status400BadRequest);
        return Ok(await recommendations.RecommendAsync(request, ct));
    }
}
