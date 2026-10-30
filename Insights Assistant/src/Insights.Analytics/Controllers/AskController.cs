using Insights.Analytics.Filters;
using Insights.Analytics.Models;
using Insights.Analytics.Services.Ask;
using Microsoft.AspNetCore.Mvc;

namespace Insights.Analytics.Controllers;

[ApiController]
[Route("ask")]
[AiHubErrorFilter]
public sealed class AskController(AskService askService) : ControllerBase
{
    /// Question in English -> SQL (AI Hub, from the knowledge model) -> rows (PostgreSQL, read-only) -> plain-English answer
    /// (AI Hub), in one call. Optional history (earlier questions and their queries) makes it a follow-up. If the
    /// generated query fails, the AI corrects it once; if that fails too, the 400 problem response includes the last query as "sql".
    [HttpPost]
    [ProducesResponseType<AskResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<AskResponse>> Ask(AskRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return Problem("'question' is required.", statusCode: StatusCodes.Status400BadRequest);
        return Ok(await askService.AskAsync(request, ct));
    }
}
