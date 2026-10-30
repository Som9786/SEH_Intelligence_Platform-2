using Insights.Analytics.Configuration;
using Insights.Analytics.Services.Data;
using Insights.Analytics.Services.KnowledgeModel;
using System.Data.Common;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Extensions.Options;
using Neo4j.Driver;

namespace Insights.Analytics.Filters;

/// Turns "Neo4j is down", "the data's database is down" and "the knowledge model files have problems" on any endpoint into
/// a problem response with the cause, instead of a generic 500. Runs inside UseExceptionHandler, which still logs the exception.
/// A query the database rejects (QueryFailedException) isn't handled here: /query and /ask answer it with 400. Any other
/// database error is the connection's.
public sealed class DatabaseErrorHandler(IProblemDetailsService problemDetails, IOptions<Neo4jOptions> neo4j, PosBasketDatabase data)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        (int Status, string Title, string Detail)? problem = exception switch
        {
            // The Neo4j driver's own message ("Failed after retried ... make sure that your database is online") hides the cause.
            ServiceUnavailableException => (StatusCodes.Status503ServiceUnavailable, "Neo4j is not reachable",
                $"Could not reach Neo4j at {neo4j.Value.Uri} (database {neo4j.Value.Database}), which holds the knowledge model. " +
                $"Check that it's running, then try again. Cause: {RootCause(exception).Message}"),
            DataUnavailableException or DbException => (StatusCodes.Status503ServiceUnavailable, $"{data.Dialect} is not reachable",
                $"Could not reach {data.Name}, which holds the data. Check that it's running and PosBasket is set up, then try again. " +
                $"Cause: {RootCause(exception).Message}"),
            KnowledgeModelException => (StatusCodes.Status500InternalServerError, "Knowledge model error",
                $"The knowledge model couldn't be loaded into Neo4j. Fix {KnowledgeModelOptions.FileName}, {DatasetOptions.RulesFileName} or " +
                $"{DatasetOptions.ExamplesFileName}; it reloads when the file is saved. {exception.Message}"),
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
