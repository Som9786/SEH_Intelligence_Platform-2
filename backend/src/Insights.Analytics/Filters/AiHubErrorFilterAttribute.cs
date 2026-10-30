using Insights.Common.AiHub;
using Insights.Analytics.Services.Ask;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace Insights.Analytics.Filters;

/// Turns AI Hub failures, and failed queries from /ask, into problem responses the Q&A page can show.
public sealed class AiHubErrorFilterAttribute : ExceptionFilterAttribute
{
    public override void OnException(ExceptionContext context)
    {
        (int Status, string Title, string Detail)? problem = context.Exception switch
        {
            // The AI Hub's own status, title and detail, e.g. 502 "OpenAI error (429)".
            AiHubException e => (e.StatusCode, e.Title, e.Message),
            AskQueryException e => (StatusCodes.Status400BadRequest, e.Title, e.Message),
            HttpRequestException e => (StatusCodes.Status503ServiceUnavailable, "AI Hub unavailable",
                $"Could not reach the AI Hub: {e.Message}"),
            // HttpClient timeouts surface as TaskCanceledException; a caller hanging up is not one.
            TaskCanceledException when !context.HttpContext.RequestAborted.IsCancellationRequested =>
                (StatusCodes.Status504GatewayTimeout, "AI Hub timeout", "The AI Hub did not answer in time (AiHub:TimeoutSeconds)."),
            _ => null,
        };
        if (problem is not { } p)
            return;

        var factory = context.HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
        var details = factory.CreateProblemDetails(context.HttpContext, p.Status, p.Title, detail: p.Detail);
        if (context.Exception is AskQueryException query)
        {
            details.Extensions["sql"] = query.Sql;
            details.Extensions["explanation"] = query.Explanation;
        }
        context.Result = new ObjectResult(details) { StatusCode = p.Status };
        context.ExceptionHandled = true;
    }
}
