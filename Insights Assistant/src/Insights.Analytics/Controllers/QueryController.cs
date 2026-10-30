using Insights.Analytics.Models;
using Insights.Analytics.Services.Query;
using Microsoft.AspNetCore.Mvc;

namespace Insights.Analytics.Controllers;

[ApiController]
[Route("query")]
public sealed class QueryController(SqlQueryService queryService) : ControllerBase
{
    /// Runs one read-only SQL query on the data's database (PosBasket:Provider), in its dialect. Errors come back as 400
    /// so the caller can show or retry them.
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
        catch (QueryFailedException e)
        {
            return Problem(e.Message, statusCode: StatusCodes.Status400BadRequest, title: e.Title);
        }
    }
}
