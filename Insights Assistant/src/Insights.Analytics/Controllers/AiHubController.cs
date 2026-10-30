using Insights.Analytics.Filters;
using Insights.Analytics.Models;
using Insights.Analytics.Services.AiHub;
using Microsoft.AspNetCore.Mvc;

namespace Insights.Analytics.Controllers;

/// The AI Hub's endpoints, forwarded so clients only need Analytics. Each call waits for the AI Hub's response.
[ApiController]
[Route("ai")]
[AiHubErrorFilter]
public sealed class AiHubController(AiHubClient ai) : ControllerBase
{
    /// Question in English -> one read-only query in the data's dialect (PostgreSQL or SQL Server) for /query, written from the part of the knowledge model the
    /// question is about. Optional history makes it a follow-up of earlier questions; failedSql and error ask for a
    /// corrected query after /query rejected one.
    [HttpPost("sql")]
    [ProducesResponseType<SqlResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<SqlResponse>> Sql(SqlRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return Problem("'question' is required.", statusCode: StatusCodes.Status400BadRequest);
        return Ok(await ai.GenerateSqlAsync(request, ct));
    }

    /// Question + /query results -> a plain-English answer.
    [HttpPost("answer")]
    [ProducesResponseType<AnswerResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AnswerResponse>> Answer(AnswerRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return Problem("'question' is required.", statusCode: StatusCodes.Status400BadRequest);
        return Ok(await ai.AnswerAsync(request, ct));
    }

    /// Whether the AI Hub is up, and the model it uses.
    [HttpGet("health")]
    public Task<AiHealthResponse> Health(CancellationToken ct) => ai.HealthAsync(ct);

    /// Tokens and estimated cost of every OpenAI call the AI Hub has made, counted from its replies (no OpenAI billing call).
    [HttpGet("usage")]
    public async Task<ContentResult> Usage(CancellationToken ct) =>
        Content(await ai.GetUsageAsync(ct), "application/json");

    /// The AI Hub's debug log entries with an id greater than ?after=, for the Q&A page's Debug log card.
    [HttpGet("logs")]
    public async Task<ContentResult> Logs([FromQuery] long after, CancellationToken ct) =>
        Content(await ai.GetLogsAsync(after, ct), "application/json");

    [HttpDelete("logs")]
    public async Task<NoContentResult> ClearLogs(CancellationToken ct)
    {
        await ai.ClearLogsAsync(ct);
        return NoContent();
    }
}
