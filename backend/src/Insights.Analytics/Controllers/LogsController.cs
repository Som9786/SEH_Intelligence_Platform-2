using Insights.Common.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Insights.Analytics.Controllers;

/// This service's recent step-by-step logs, for the Q&A page's Debug log card. Turned on with DebugLog:Enabled.
[ApiController]
[Route("logs")]
public sealed class LogsController(DebugLogStore store, FileLogProvider fileLog) : ControllerBase
{
    /// Entries with an id greater than ?after= (default 0: all kept entries), and today's log file.
    [HttpGet]
    public DebugLogResponse Get([FromQuery] long after = 0) => store.Read(after) with { LogFile = fileLog.CurrentPath };

    [HttpDelete]
    public NoContentResult Clear()
    {
        store.Clear();
        return NoContent();
    }
}
