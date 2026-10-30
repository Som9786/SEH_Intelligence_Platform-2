using System.ClientModel;
using Insights.AiHub.Services.Llm;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace Insights.AiHub.Filters;

/// Maps configuration, OpenAI and analytics-service failures to readable problem responses.
public sealed class UpstreamErrorFilterAttribute : ExceptionFilterAttribute
{
    public override void OnException(ExceptionContext context)
    {
        (int Status, string Title, string Detail)? problem = context.Exception switch
        {
            InvalidOperationException e => (StatusCodes.Status500InternalServerError, "Configuration error", e.Message),
            // OpenAI's own text for these repeats the masked key and doesn't say how to fix it here.
            ClientResultException { Status: 401 } => (StatusCodes.Status502BadGateway, "OpenAI rejected the API key",
                "The OpenAI API key is wrong, expired or revoked. Set a valid one with " +
                "`dotnet user-secrets set OpenAI:ApiKey <key> --project src/Insights.AiHub` (or the `OPENAI_API_KEY` environment variable), " +
                "then restart the AI Hub."),
            ClientResultException { Status: 429 } e => (StatusCodes.Status502BadGateway, "OpenAI rate limit or quota reached",
                $"OpenAI refused the request: too many requests, or the account is out of credit. Try again shortly, or check billing. {e.Message}"),
            ClientResultException e => (StatusCodes.Status502BadGateway, $"OpenAI error ({e.Status})", e.Message),
            LlmReplyException e => (StatusCodes.Status502BadGateway, "No usable answer from OpenAI", e.Message),
            BudgetExceededException e => (StatusCodes.Status429TooManyRequests, "Daily OpenAI budget reached", e.Message),
            HttpRequestException e => (StatusCodes.Status503ServiceUnavailable, "Analytics service unavailable",
                $"Could not load the knowledge model context from the analytics service: {e.Message}"),
            // The OpenAI client's network timeout surfaces as TaskCanceledException; a caller hanging up is not one.
            TaskCanceledException when !context.HttpContext.RequestAborted.IsCancellationRequested =>
                (StatusCodes.Status504GatewayTimeout, "OpenAI timeout", "The model did not answer in time (OpenAI:TimeoutSeconds)."),
            _ => null,
        };
        if (problem is not { } p)
            return;

        var factory = context.HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
        var details = factory.CreateProblemDetails(context.HttpContext, p.Status, p.Title, detail: p.Detail);
        context.Result = new ObjectResult(details) { StatusCode = p.Status };
        context.ExceptionHandled = true;
    }
}
