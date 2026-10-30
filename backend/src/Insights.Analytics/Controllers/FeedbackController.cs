using Insights.Analytics.Models;
using Insights.Analytics.Services.Dataset;
using Insights.Analytics.Services.Query;
using Microsoft.AspNetCore.Mvc;

namespace Insights.Analytics.Controllers;

/// Ratings of answers, and the verified example queries the AI learns from.
[ApiController]
public sealed class FeedbackController(FeedbackStore feedback, ExampleStore examples, SqlQueryService queries) : ControllerBase
{
    /// Saves a 👍 / 👎 rating of an answer to App_Data/feedback.jsonl.
    [HttpPost("feedback")]
    [ProducesResponseType<Feedback>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public ActionResult<Feedback> Rate(FeedbackRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return Problem("'question' is required.", statusCode: StatusCodes.Status400BadRequest);
        return feedback.Add(request);
    }

    /// The newest ratings first; ?count= (default 100) limits how many.
    [HttpGet("feedback")]
    public IReadOnlyList<Feedback> Ratings([FromQuery] int count = 100) => feedback.Latest(Math.Clamp(count, 1, 1000));

    /// The verified example queries in query-examples.json.
    [HttpGet("examples")]
    public IReadOnlyList<ExampleQuery> Examples() => examples.All();

    /// Saves a question and its SQL as a verified example, replacing an example with the same question.
    /// The query must pass the same read-only check as /query.
    [HttpPost("examples")]
    [ProducesResponseType<IReadOnlyList<ExampleQuery>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public ActionResult<IReadOnlyList<ExampleQuery>> SaveExample(ExampleRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Question) || string.IsNullOrWhiteSpace(request.Sql))
            return Problem("'question' and 'sql' are required.", statusCode: StatusCodes.Status400BadRequest);
        if (SqlGuard.RejectionReason(request.Sql, queries.Tables, queries.Dialect) is { } reason)
            return Problem(reason, statusCode: StatusCodes.Status400BadRequest, title: "Query rejected");
        return Ok(examples.Save(request.Question, request.Sql, queries.Dialect));
    }

    /// Removes the example with ?question= written for the data's database (PostgreSQL or SQL Server).
    [HttpDelete("examples")]
    public IActionResult RemoveExample([FromQuery] string question) =>
        examples.Remove(question, queries.Dialect) ? NoContent()
            : Problem($"No example has the question \"{question}\".", statusCode: StatusCodes.Status404NotFound);
}
