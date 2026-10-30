using Insights.AiHub.Models;
using Insights.AiHub.Services.Llm;
using Microsoft.AspNetCore.Mvc;

namespace Insights.AiHub.Controllers;

[ApiController]
[Route("health")]
public sealed class HealthController(LlmClient llm) : ControllerBase
{
    /// Liveness plus the model in use, for the Q&A page's status pill. Doesn't call the model.
    [HttpGet]
    public HealthResponse Get() => new("ok", llm.ConfiguredModel);
}
