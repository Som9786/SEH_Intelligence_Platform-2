using System.Text.Json.Serialization;
using Insights.Common;
using Insights.Common.Diagnostics;
using Insights.DbCatalog.Configuration;
using Insights.DbCatalog.Extensions;

var builder = ServiceHost.CreateBuilder(args);
// The page's name, suggested questions and synonyms. Reloaded when it changes, and the synonyms reloaded into Neo4j.
builder.Configuration.AddJsonFile(GuideOptions.FileName, optional: false, reloadOnChange: true);
builder.AddDebugLog();
builder.Services.AddDbCatalog(builder.Configuration);
// Empty fields are left out, which keeps the catalog context sent to the AI small.
builder.Services.AddControllers().AddJsonOptions(o => o.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull);
builder.Services.AddProblemDetails();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();
app.UseExceptionHandler();
// API docs at /swagger, only when developing.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
// /ask, /context, /catalog, /catalog/files, /guide, /health and /ai/usage (see Controllers).
app.MapControllers();

app.Run();
