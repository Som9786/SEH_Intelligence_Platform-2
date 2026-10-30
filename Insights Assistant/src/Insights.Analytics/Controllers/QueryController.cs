using Insights.Analytics.Configuration;
using Insights.Analytics.Models;
using Insights.Analytics.Services.Query;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Insights.Analytics.Controllers;

[ApiController]
[Route("query")]
public sealed class QueryController(SqlQueryService queryService, IOptions<QueryOptions> options) : ControllerBase
{
    /// Runs one read-only SQL query on PostgreSQL. Errors come back as 400 so the caller can show or retry them.
    [HttpPost]
    [ProducesResponseType<QueryResult>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<QueryResult>> Run(QueryRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Sql))
            return Problem("'sql' is required.", statusCode: StatusCodes.Status400BadRequest);
        try
        {
            return Ok(await queryService.RunReadOnlyAsync(request.Sql, ct));
        }
        catch (QueryRejectedException e)
        {
            return Problem(e.Message, statusCode: StatusCodes.Status400BadRequest, title: "Query rejected");
        }
        catch (PostgresException e)
        {
            var (title, detail) = PostgresErrors.Describe(e, options.Value.TimeoutSeconds);
            return Problem(detail, statusCode: StatusCodes.Status400BadRequest, title: title);
        }
    }
}
