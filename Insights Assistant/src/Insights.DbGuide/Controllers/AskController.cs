using Insights.DbGuide.Models;
using Insights.Common;
using Insights.DbGuide.Services.Ask;
using Microsoft.AspNetCore.Mvc;

namespace Insights.DbGuide.Controllers;

[ApiController]
[Route("ask")]
public sealed class AskController(AskService askService) : ControllerBase
{
    /// A question about the database in English -> an answer from the catalog: which tables to use, how to join them,
    /// what columns mean, with an example query. Optional history makes it a follow-up.
    [HttpPost]
    [ProducesResponseType<AskResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AskResponse>> Ask(AskRequest request, CancellationToken ct)
    {
        if (QuestionRules.Problem(request.Question) is { } problem)
            return Problem(problem, statusCode: StatusCodes.Status400BadRequest);
        return await askService.AskAsync(request, ct);
    }
}
