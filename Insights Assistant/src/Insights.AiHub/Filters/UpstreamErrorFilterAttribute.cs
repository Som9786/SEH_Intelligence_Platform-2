using System.ClientModel;
using Amazon.BedrockRuntime;
using Amazon.BedrockRuntime.Model;
using Insights.AiHub.Services.Llm;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace Insights.AiHub.Filters;

/// Maps configuration, OpenAI, Bedrock and analytics-service failures to readable problem responses.
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
            AccessDeniedException e => (StatusCodes.Status502BadGateway, "Bedrock refused access",
                "The Bedrock API key or AWS credentials are wrong or expired, or they aren't allowed to call this model in this region. " +
                "Check Bedrock:ApiKey (or AccessKeyId/SecretAccessKey), Bedrock:Region and the model access in the Bedrock console, " +
                $"then restart the AI Hub. {e.Message}"),
            ThrottlingException or ServiceQuotaExceededException => (StatusCodes.Status502BadGateway, "Bedrock rate limit or quota reached",
                $"Bedrock refused the request: too many requests or tokens. Try again shortly. {context.Exception.Message}"),
            ValidationException e => (StatusCodes.Status502BadGateway, "Bedrock rejected the request",
                $"Check Bedrock:Model (a model or inference profile ID that supports JSON schema output) and Bedrock:Region. {e.Message}"),
            AmazonBedrockRuntimeException e => (StatusCodes.Status502BadGateway, $"Bedrock error ({(int)e.StatusCode})", e.Message),
            BedrockUnreachableException e => (StatusCodes.Status503ServiceUnavailable, "Bedrock unreachable",
                $"{e.Message}. Check the network, proxy or firewall, and Bedrock:Region."),
            // Raised before any request is sent: no credentials found, or another client-side problem such as a bad region.
            Amazon.Runtime.AmazonClientException e when IsCredentialProblem(e) => (StatusCodes.Status502BadGateway,
                "Bedrock credentials not found or not usable",
                "Set Bedrock:ApiKey (a Bedrock API key) with " +
                "`dotnet user-secrets set Bedrock:ApiKey <key> --project src/Insights.AiHub`, or Bedrock:AccessKeyId and " +
                $"Bedrock:SecretAccessKey, or the AWS_BEARER_TOKEN_BEDROCK environment variable. {e.Message}"),
            Amazon.Runtime.AmazonClientException e => (StatusCodes.Status502BadGateway, "Bedrock client error",
                $"Check Bedrock:Region and the other Bedrock settings. {e.Message}"),
            LlmReplyException e => (StatusCodes.Status502BadGateway, "No usable answer from the model", e.Message),
            BudgetExceededException e => (StatusCodes.Status429TooManyRequests, "Daily model budget reached", e.Message),
            HttpRequestException e => (StatusCodes.Status503ServiceUnavailable, "Analytics service unavailable",
                $"Could not load the knowledge model context from the analytics service: {e.Message}"),
            TimeoutException e => (StatusCodes.Status504GatewayTimeout, "Model timeout", e.Message),
            // The OpenAI client's network timeout surfaces as TaskCanceledException; a caller hanging up is not one.
            TaskCanceledException when !context.HttpContext.RequestAborted.IsCancellationRequested =>
                (StatusCodes.Status504GatewayTimeout, "Model timeout", "The model did not answer in time (OpenAI:TimeoutSeconds)."),
            _ => null,
        };
        if (problem is not { } p)
            return;

        var factory = context.HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();
        var details = factory.CreateProblemDetails(context.HttpContext, p.Status, p.Title, detail: p.Detail);
        context.Result = new ObjectResult(details) { StatusCode = p.Status };
        context.ExceptionHandled = true;
    }

    static bool IsCredentialProblem(Exception e) =>
        e.Message.Contains("credential", StringComparison.OrdinalIgnoreCase) || e.Message.Contains("token", StringComparison.OrdinalIgnoreCase);
}
