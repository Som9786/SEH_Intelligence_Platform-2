using Insights.Analytics.Models;
using Insights.Analytics.Services.KnowledgeModel;
using Microsoft.AspNetCore.Mvc;

namespace Insights.Analytics.Controllers;

/// The knowledge model in Neo4j: what the data means and where it lives in the data's database.
[ApiController]
public sealed class SchemaController(KnowledgeModelReader reader) : ControllerBase
{
    /// The whole knowledge model: tables and columns, concepts with their attributes, relationships, metrics, business rules
    /// and examples, plus the business dates the data covers.
    [HttpGet("schema")]
    [ProducesResponseType<KnowledgeModelContext>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public Task<KnowledgeModelContext> Get(CancellationToken ct) => reader.GetAllAsync(ct);

    /// The part of the knowledge model a question is about, as Analytics sends it with each AI Hub /sql call: the concepts and metrics its words name,
    /// the concepts that join them, and the rules and examples about them. History (earlier questions) keeps a follow-up's
    /// concepts. A question that names nothing in the knowledge model gets all of it.
    [HttpPost("context")]
    [ProducesResponseType<KnowledgeModelContext>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<KnowledgeModelContext>> Context(ContextRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return Problem("'question' is required.", statusCode: StatusCodes.Status400BadRequest);
        return await reader.GetContextAsync(request, ct);
    }
}
