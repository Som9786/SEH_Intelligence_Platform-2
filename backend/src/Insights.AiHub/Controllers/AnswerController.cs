using Insights.AiHub.Filters;
using Insights.AiHub.Models;
using Insights.AiHub.Services.Answer;
using Microsoft.AspNetCore.Mvc;

namespace Insights.AiHub.Controllers;

[ApiController]
[Route("answer")]
[UpstreamErrorFilter]
public sealed class AnswerController(AnswerService answerService) : ControllerBase
{
    /// Question + the analytics service's query results -> a plain-English answer.
    [HttpPost]
    [ProducesResponseType<AnswerResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AnswerResponse>> Answer(AnswerRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return Problem("'question' is required.", statusCode: StatusCodes.Status400BadRequest);
        return Ok(await answerService.AnswerAsync(request, ct));
    }
}
