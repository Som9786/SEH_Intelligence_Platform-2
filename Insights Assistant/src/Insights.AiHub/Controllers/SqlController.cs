using Insights.AiHub.Filters;
using Insights.AiHub.Models;
using Insights.AiHub.Services.Sql;
using Microsoft.AspNetCore.Mvc;

namespace Insights.AiHub.Controllers;

[ApiController]
[Route("sql")]
[UpstreamErrorFilter]
public sealed class SqlController(SqlGenerationService sqlService) : ControllerBase
{
    /// Question in English + its knowledge model context -> one read-only query (PostgreSQL or SQL Server, whichever holds
    /// the data) for the analytics service's /query endpoint. Optional history makes it a follow-up; failedSql and error ask
    /// for a corrected query.
    [HttpPost]
    [ProducesResponseType<SqlResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<SqlResponse?>> Generate(SqlRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return Problem("'question' is required.", statusCode: StatusCodes.Status400BadRequest);
        if (request.Context is not { ValueKind: System.Text.Json.JsonValueKind.Object })
            return Problem("'context' is required: the question's part of the knowledge model, from Analytics' POST /context.",
                statusCode: StatusCodes.Status400BadRequest);
        return Ok(await sqlService.GenerateAsync(request, ct));
    }
}
