using Insights.AiHub.Filters;
using Insights.AiHub.Models;
using Insights.AiHub.Services.Guide;
using Microsoft.AspNetCore.Mvc;

namespace Insights.AiHub.Controllers;

[ApiController]
[Route("guide")]
[UpstreamErrorFilter]
public sealed class GuideController(GuideService guideService) : ControllerBase
{
    /// Question about a database's structure + the part of its catalog it's about -> an answer and an example query.
    /// Called by DB Catalog, which reads the catalog from its own Neo4j graph. Optional history makes it a follow-up.
    [HttpPost]
    [ProducesResponseType<GuideResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<GuideResponse?>> Answer(GuideRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return Problem("'question' is required.", statusCode: StatusCodes.Status400BadRequest);
        return Ok(await guideService.AnswerAsync(request, ct));
    }
}
