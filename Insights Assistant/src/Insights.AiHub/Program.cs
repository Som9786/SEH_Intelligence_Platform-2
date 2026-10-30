using Insights.Common.Diagnostics;
using Insights.AiHub.Extensions;

var builder = WebApplication.CreateBuilder(args);
builder.AddDebugLog();
builder.Services.AddAiHub(builder.Configuration);
builder.Services.AddControllers();
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
// /sql, /answer, /guide, /intent, /ask, /health, /usage and /logs (see Controllers).
app.MapControllers();

app.Run();
