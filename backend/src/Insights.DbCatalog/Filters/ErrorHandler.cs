using Insights.Common.AiHub;
using Insights.DbCatalog.Configuration;
using Insights.DbCatalog.Services.AiHub;
using Insights.DbCatalog.Services.Catalog;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Extensions.Options;
using Neo4j.Driver;

namespace Insights.DbCatalog.Filters;

/// Turns "Neo4j is down", "the catalog export has problems" and AI Hub failures on any endpoint into a problem response
/// with the cause, instead of a generic 500. Runs inside UseExceptionHandler, which still logs the exception.
public sealed class ErrorHandler(IProblemDetailsService problemDetails, IOptions<Neo4jOptions> neo4j, IOptions<AiHubOptions> aiHub)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        (int Status, string Title, string Detail)? problem = exception switch
        {
            // The Neo4j driver's own message ("Failed after retried ... make sure that your database is online") hides the cause.
            ServiceUnavailableException => (StatusCodes.Status503ServiceUnavailable, "Neo4j is not reachable",
                $"Could not reach Neo4j at {neo4j.Value.Uri} (database {neo4j.Value.Database}), which holds the catalog. " +
                $"Check that it's running, then try again. Cause: {RootCause(exception).Message}"),
            UnknownDatabaseException => (StatusCodes.Status404NotFound, "Unknown database", exception.Message),
            CatalogException => (StatusCodes.Status500InternalServerError, "Catalog error",
                $"The database catalog couldn't be loaded into Neo4j. Fix its folder under Catalog:Path, or its {GuideOptions.FileName}; " +
                $"it reloads when a file is saved. {exception.Message}"),
            // The AI Hub's own status, title and detail, e.g. 502 "OpenAI error (429)".
            AiHubException e => (e.StatusCode, e.Title, e.Message),
            HttpRequestException e => (StatusCodes.Status503ServiceUnavailable, "AI Hub unavailable",
                $"Could not reach the AI Hub at {aiHub.Value.BaseUrl}: {e.Message}. Is Insights.AiHub running?"),
            // HttpClient timeouts surface as TaskCanceledException; a caller hanging up is not one.
            TaskCanceledException when !context.RequestAborted.IsCancellationRequested =>
                (StatusCodes.Status504GatewayTimeout, "AI Hub timeout", "The AI Hub did not answer in time (AiHub:TimeoutSeconds)."),
            _ => null,
        };
        if (problem is not { } p)
            return false;

        context.Response.StatusCode = p.Status;
        return await problemDetails.TryWriteAsync(new()
        {
            HttpContext = context,
            Exception = exception,
            ProblemDetails = { Status = p.Status, Title = p.Title, Detail = p.Detail },
        });
    }

    static Exception RootCause(Exception e)
    {
        while (e.InnerException is { } inner)
            e = inner;
        return e;
    }
}
