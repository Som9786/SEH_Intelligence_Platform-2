using System.Text.Json;
using Insights.Workspace;

// Each user's saved work: questions scheduled to run again, and answers kept as widgets on a capability board. Stored in
// files (WorkspaceStore). Schedules are saved and shown, not run yet. Reached through Insights.Gateway at /api/workspace,
// which sends the signed-in user in X-User; this service listens on localhost only, so nothing else can set it.
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<WorkspaceStore>();
builder.Services.AddSingleton<ReviewStore>();
builder.Services.AddSingleton<ShareStore>();
builder.Services.AddProblemDetails();

var app = builder.Build();
app.UseExceptionHandler();

const int MaxWidgetRows = 500;

// Every route but /health needs the user the gateway signed in.
app.Use(async (context, next) =>
{
    if (!context.Request.Path.StartsWithSegments("/health") && string.IsNullOrWhiteSpace(context.Request.Headers["X-User"]))
    {
        await Results.Problem("No signed-in user (X-User). Call this service through the gateway.",
            statusCode: StatusCodes.Status401Unauthorized).ExecuteAsync(context);
        return;
    }
    await next();
});

static string UserOf(HttpContext context) => context.Request.Headers["X-User"].ToString();
static IResult Invalid(string problem) => Results.Problem(problem, statusCode: StatusCodes.Status400BadRequest);
static IResult NotFound(string what) => Results.Problem($"No {what} with that id.", statusCode: StatusCodes.Status404NotFound);

app.MapGet("/health", (WorkspaceStore store) => Results.Ok(new { status = "ok", dataPath = store.Folder }));

// ---------- Schedules ----------

app.MapGet("/schedules", async (HttpContext context, WorkspaceStore store, CancellationToken ct) =>
{
    var workspace = await store.ReadAsync(UserOf(context), ct);
    var now = DateTimeOffset.Now;
    return Results.Ok(workspace.Schedules.OrderByDescending(s => s.CreatedAt)
        .Select(s => new ScheduleView(s, ScheduleRules.NextRun(s, now))));
});

app.MapPost("/schedules", async (ScheduleInput input, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
{
    if (ScheduleRules.Problem(input) is { } problem)
        return Invalid(problem);
    var now = DateTimeOffset.Now;
    var schedule = Build(Guid.NewGuid().ToString("n"), input, now, now);
    await store.ChangeAsync(UserOf(context), w => { w.Schedules.Add(schedule); return true; }, ct);
    return Results.Created($"/schedules/{schedule.Id}", new ScheduleView(schedule, ScheduleRules.NextRun(schedule, now)));
});

app.MapPut("/schedules/{id}", async (string id, ScheduleInput input, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
{
    if (ScheduleRules.Problem(input) is { } problem)
        return Invalid(problem);
    var now = DateTimeOffset.Now;
    var updated = await store.ChangeAsync(UserOf(context), w =>
    {
        var index = w.Schedules.FindIndex(s => s.Id == id);
        if (index < 0)
            return null;
        // The board and the answer shown when it was scheduled stay unless the edit sends new ones.
        var old = w.Schedules[index];
        w.Schedules[index] = Build(id, input with { Board = input.Board ?? old.Board, Answer = input.Answer ?? old.Answer },
            old.CreatedAt, now);
        return w.Schedules[index];
    }, ct);
    return updated is null ? NotFound("schedule") : Results.Ok(new ScheduleView(updated, ScheduleRules.NextRun(updated, now)));
});

app.MapDelete("/schedules/{id}", async (string id, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
    await store.ChangeAsync(UserOf(context), w => w.Schedules.RemoveAll(s => s.Id == id), ct) > 0
        ? Results.NoContent()
        : NotFound("schedule"));

// ---------- Widgets ----------

app.MapGet("/widgets", async (string? board, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
{
    var workspace = await store.ReadAsync(UserOf(context), ct);
    // As the user arranged them; widgets added since (not in the order, -1) first, newest first.
    int Position(Widget w) => workspace.WidgetOrder.TryGetValue(w.Board, out var ids) ? ids.IndexOf(w.Id) : -1;
    return Results.Ok(workspace.Widgets.Where(w => board is null || w.Board == board)
        .OrderBy(Position).ThenByDescending(w => w.CreatedAt));
});

// Drag and drop on a board: keeps the order its widgets are shown in. Ids not on the board are ignored.
app.MapPut("/widgets/order", async (WidgetOrderInput input, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
{
    if (input.Board is null || !Boards.All.Contains(input.Board))
        return Invalid($"'board' must be one of {string.Join(", ", Boards.All)}.");
    if (input.Ids is null || input.Ids.Length > 1000)
        return Invalid("'ids' is required, up to 1000 widget ids.");
    await store.ChangeAsync(UserOf(context), w =>
    {
        var onBoard = w.Widgets.Where(x => x.Board == input.Board).Select(x => x.Id).ToHashSet();
        w.WidgetOrder[input.Board] = input.Ids.Where(onBoard.Contains).Distinct().ToList();
        return true;
    }, ct);
    return Results.NoContent();
});

app.MapPost("/widgets", async (WidgetInput input, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
{
    if (input.Board is null || !Boards.All.Contains(input.Board))
        return Invalid($"'board' must be one of {string.Join(", ", Boards.All)}.");
    if (string.IsNullOrWhiteSpace(input.Question) || input.Question.Length > 1000)
        return Invalid("'question' is required, up to 1000 characters.");
    if (ResultProblem(input.Result) is { } problem)
        return Invalid(problem);
    var title = string.IsNullOrWhiteSpace(input.Title) ? input.Question.Trim() : input.Title.Trim();
    var widget = new Widget(Guid.NewGuid().ToString("n"), input.Board, title.Length > 160 ? title[..160] : title,
        input.Question.Trim(), input.Answer, input.Result, DateTimeOffset.Now, input.FetchedAt, input.Details);
    await store.ChangeAsync(UserOf(context), w => { w.Widgets.Add(widget); return true; }, ct);
    return Results.Created($"/widgets/{widget.Id}", widget);
});

// Refresh: the same question answered again on the latest data replaces the widget's answer and rows.
app.MapPut("/widgets/{id}", async (string id, WidgetRefresh input, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
{
    if (ResultProblem(input.Result) is { } problem)
        return Invalid(problem);
    var updated = await store.ChangeAsync(UserOf(context), w =>
    {
        var index = w.Widgets.FindIndex(x => x.Id == id);
        if (index < 0)
            return null;
        w.Widgets[index] = w.Widgets[index] with
        {
            Answer = input.Answer, Result = input.Result, FetchedAt = input.FetchedAt ?? DateTimeOffset.Now,
            Details = input.Details ?? w.Widgets[index].Details,
        };
        return w.Widgets[index];
    }, ct);
    return updated is null ? NotFound("widget") : Results.Ok(updated);
});

app.MapDelete("/widgets/{id}", async (string id, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
    await store.ChangeAsync(UserOf(context), w => w.Widgets.RemoveAll(x => x.Id == id), ct) > 0
        ? Results.NoContent()
        : NotFound("widget"));

// One widget, for its own page (opened in a new tab from the board).
app.MapGet("/widgets/{id}", async (string id, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
    (await store.ReadAsync(UserOf(context), ct)).Widgets.Find(w => w.Id == id) is { } widget
        ? Results.Ok(widget)
        : NotFound("widget"));

// ---------- Shared insights (anyone signed in can open one by its link) ----------

// Shares a copy of one of the signed-in user's widgets as it is now; who shared it is the signed-in user.
app.MapPost("/shares", async (ShareInput input, HttpContext context, WorkspaceStore store, ShareStore shares, CancellationToken ct) =>
{
    var widget = (await store.ReadAsync(UserOf(context), ct)).Widgets.Find(w => w.Id == input.WidgetId);
    if (widget is null)
        return NotFound("widget");
    var share = new SharedInsight(Guid.NewGuid().ToString("n"), widget.Board, widget.Title, widget.Question, widget.Answer,
        widget.Result, widget.Details, widget.FetchedAt ?? widget.CreatedAt, UserOf(context), DateTimeOffset.Now);
    await shares.SaveAsync(share, ct);
    return Results.Created($"/shares/{share.Id}", share);
});

app.MapGet("/shares/{id}", async (string id, ShareStore shares, CancellationToken ct) =>
    await shares.FindAsync(id, ct) is { } share ? Results.Ok(share) : NotFound("shared insight"));

// ---------- Table reviews (shared by everyone; the reviewer is the signed-in user) ----------

app.MapGet("/reviews", async (ReviewStore reviews, CancellationToken ct) => Results.Ok((await reviews.AllAsync(ct)).Values));

app.MapGet("/reviews/{tableId}", async (string tableId, ReviewStore reviews, CancellationToken ct) =>
    (await reviews.AllAsync(ct)).TryGetValue(tableId, out var review) ? Results.Ok(review) : NotFound("review for that table"));

app.MapPut("/reviews/{tableId}", async (string tableId, ReviewInput input, HttpContext context, ReviewStore reviews, CancellationToken ct) =>
{
    if (input.Status is null || !ReviewStatuses.All.Contains(input.Status))
        return Invalid($"'status' must be one of {string.Join(", ", ReviewStatuses.All)}.");
    if (tableId.Length > 256)
        return Invalid("The table id is too long.");
    if (input.Comment is { Length: > 2000 })
        return Invalid("'comment' can be up to 2000 characters.");
    var review = new TableReview(tableId, input.Status, input.Comment?.Trim() ?? "", UserOf(context), DateTimeOffset.Now);
    return Results.Ok(await reviews.SaveAsync(review, ct));
});

app.Logger.LogInformation("Workspace files are kept in {Folder}", app.Services.GetRequiredService<WorkspaceStore>().Folder);
app.Run();

/// Why a widget's result can't be kept, or null: it must be Analytics' { columns, rows, truncated }, not too large.
static string? ResultProblem(JsonElement? result) =>
    result is { } r && (r.ValueKind != JsonValueKind.Object
        || !r.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Array
        || rows.GetArrayLength() > MaxWidgetRows)
        ? $"'result' must be an object with columns and rows, at most {MaxWidgetRows} rows."
        : null;

static Schedule Build(string id, ScheduleInput input, DateTimeOffset createdAt, DateTimeOffset updatedAt) => new(
    id, input.Name!.Trim(), input.Question!.Trim(), input.Frequency!, input.Time!, input.StartsOn!,
    input.Frequency == Frequencies.Weekly ? input.DayOfWeek : null,
    input.Frequency is Frequencies.Monthly or Frequencies.Quarterly ? input.DayOfMonth : null,
    input.Enabled ?? true, input.Board, input.Answer, createdAt, updatedAt);
