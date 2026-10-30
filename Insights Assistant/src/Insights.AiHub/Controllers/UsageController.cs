using Insights.AiHub.Models;
using Insights.AiHub.Services.Llm;
using Microsoft.AspNetCore.Mvc;

namespace Insights.AiHub.Controllers;

[ApiController]
[Route("usage")]
public sealed class UsageController(UsageTracker usage) : ControllerBase
{
    /// Tokens and estimated cost of every OpenAI call this AI Hub has made, priced with OpenAI:Prices. Doesn't call OpenAI.
    [HttpGet]
    public UsageTotals Get() => usage.Totals();
}
