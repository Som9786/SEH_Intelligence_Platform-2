using Insights.Analytics.Configuration;
using Insights.Common;
using Insights.Common.Diagnostics;
using Insights.Analytics.Extensions;

var builder = ServiceHost.CreateBuilder(args);
// The knowledge model, the dataset's business rules and example queries (all loaded into Neo4j), and its suggested questions.
// Reloaded when a file changes, so edits apply without a restart. The examples file is optional: "Save as example" on
// the Q&A page creates it.
builder.Configuration.AddJsonFile(KnowledgeModelOptions.FileName, optional: false, reloadOnChange: true);
builder.Configuration.AddJsonFile(DatasetOptions.QuestionsFileName, optional: false, reloadOnChange: true);
builder.Configuration.AddJsonFile(DatasetOptions.RulesFileName, optional: false, reloadOnChange: true);
builder.Configuration.AddJsonFile(DatasetOptions.ExamplesFileName, optional: true, reloadOnChange: true);
builder.AddDebugLog();
builder.Services.AddAnalytics(builder.Configuration);
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();
app.UseExceptionHandler();
// API docs at /swagger, only when developing: they list every endpoint, including /knowledge-model/reload.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
// Q&A page (wwwroot/index.html) at the site root.
app.UseDefaultFiles();
app.UseStaticFiles();
// /query, /schema, /context, /knowledge-model, /dataset, /health, /ask and the forwarded AI Hub endpoints under /ai (see Controllers).
app.MapControllers();

app.Run();
