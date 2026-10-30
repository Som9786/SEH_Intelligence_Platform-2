using Insights.Analytics.Configuration;
using Insights.Analytics.Models;
using Insights.Analytics.Services.KnowledgeModel;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Insights.Analytics.Controllers;

[ApiController]
public sealed class KnowledgeModelController(KnowledgeModelLoader loader, IOptionsMonitor<DatasetOptions> dataset) : ControllerBase
{
    /// The last knowledge model load: when, what it loaded, and its error if it failed. 404 before the first load.
    [HttpGet("knowledge-model/status")]
    [ProducesResponseType<KnowledgeModelLoadStatus>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<KnowledgeModelLoadStatus> Status() =>
        loader.LastLoad is { } status ? status : Problem("The knowledge model hasn't been loaded yet.", statusCode: StatusCodes.Status404NotFound);

    /// Loads knowledge-model.json, business-rules.json and query-examples.json into Neo4j again. Saving one of the files does
    /// this by itself; this is for after changing the graph by hand. Replaces only the knowledge model, never data.
    [HttpPost("knowledge-model/reload")]
    [ProducesResponseType<KnowledgeModelLoadStatus>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status500InternalServerError)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public Task<KnowledgeModelLoadStatus> Reload(CancellationToken ct) => loader.LoadAsync(ct);

    /// Name and suggested questions for the dataset, for the Q&A page.
    [HttpGet("dataset")]
    public DatasetInfo Dataset() => new(dataset.CurrentValue.Name, dataset.CurrentValue.Suggestions);
}
