using System.Text.Json.Serialization;
using Insights.Common.Diagnostics;
using Insights.DbGuide.Configuration;
using Insights.DbGuide.Extensions;

var builder = WebApplication.CreateBuilder(args);
// The page's name, suggested questions and synonyms. Reloaded when it changes, and the synonyms reloaded into Neo4j.
builder.Configuration.AddJsonFile(GuideOptions.FileName, optional: false, reloadOnChange: true);
builder.AddDebugLog();
builder.Services.AddDbGuide(builder.Configuration);
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
// DB Guide page (wwwroot/index.html) at the site root.
app.UseDefaultFiles();
app.UseStaticFiles();
// /ask, /context, /catalog, /catalog/files, /guide, /health and /ai/usage (see Controllers).
app.MapControllers();

app.Run();
