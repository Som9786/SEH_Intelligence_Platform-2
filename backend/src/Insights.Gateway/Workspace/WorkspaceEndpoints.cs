using System.Text.Json;

namespace Insights.Gateway.Workspace;

/// Each user's saved work: questions scheduled to run again, answers kept as widgets on a capability board, shared
/// insights and table reviews. Stored in files (WorkspaceStore). Schedules are saved and shown, not run yet. Served by
/// the gateway itself under /api/workspace, after its sign-in and Gateway:Allow checks, so the user is the signed-in one.
public static class WorkspaceEndpoints
{
    const int MaxWidgetRows = 500;
    /// The longest heading a widget keeps.
    const int MaxTitle = 200;

    public static IServiceCollection AddWorkspace(this IServiceCollection services)
    {
        services.AddSingleton<WorkspaceStore>();
        services.AddSingleton<ReviewStore>();
        services.AddSingleton<ShareStore>();
        return services;
    }

    public static void MapWorkspace(this WebApplication app)
    {
        int ShareDays() => app.Configuration.GetValue("Workspace:ShareDays", 30);

        // The /api check in Program.cs has already refused anyone not signed in, and routes Gateway:Allow doesn't list.
        var group = app.MapGroup("/api/workspace");

        group.MapGet("/health", (WorkspaceStore store) => Results.Ok(new { status = "ok", dataPath = store.Folder }));

        // ---------- Schedules ----------

        group.MapGet("/schedules", async (HttpContext context, WorkspaceStore store, CancellationToken ct) =>
        {
            var workspace = await store.ReadAsync(UserOf(context), ct);
            var now = DateTimeOffset.Now;
            return Results.Ok(workspace.Schedules.OrderByDescending(s => s.CreatedAt)
                .Select(s => new ScheduleView(s, ScheduleRules.NextRun(s, now))));
        });

        group.MapPost("/schedules", async (ScheduleInput input, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
        {
            if (ScheduleRules.Problem(input) is { } problem)
                return Invalid(problem);
            var now = DateTimeOffset.Now;
            var schedule = Build(Guid.NewGuid().ToString("n"), input, now, now);
            await store.ChangeAsync(UserOf(context), w => { w.Schedules.Add(schedule); return true; }, ct);
            return Results.Created($"/api/workspace/schedules/{schedule.Id}", new ScheduleView(schedule, ScheduleRules.NextRun(schedule, now)));
        });

        group.MapPut("/schedules/{id}", async (string id, ScheduleInput input, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
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

        group.MapDelete("/schedules/{id}", async (string id, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
            await store.ChangeAsync(UserOf(context), w => w.Schedules.RemoveAll(s => s.Id == id), ct) > 0
                ? Results.NoContent()
                : NotFound("schedule"));

        // ---------- Widgets ----------

        group.MapGet("/widgets", async (string? board, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
        {
            var workspace = await store.ReadAsync(UserOf(context), ct);
            // As the user arranged them; widgets added since (not in the order, -1) first, newest first.
            int Position(Widget w) => workspace.WidgetOrder.TryGetValue(w.Board, out var ids) ? ids.IndexOf(w.Id) : -1;
            return Results.Ok(workspace.Widgets.Where(w => board is null || w.Board == board)
                .OrderBy(Position).ThenByDescending(w => w.CreatedAt));
        });

        // Drag and drop on a board: keeps the order its widgets are shown in. Ids not on the board are ignored.
        group.MapPut("/widgets/order", async (WidgetOrderInput input, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
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

        group.MapPost("/widgets", async (WidgetInput input, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
        {
            if (input.Board is null || !Boards.All.Contains(input.Board))
                return Invalid($"'board' must be one of {string.Join(", ", Boards.All)}.");
            if (string.IsNullOrWhiteSpace(input.Question) || input.Question.Length > 1000)
                return Invalid("'question' is required, up to 1000 characters.");
            if (ResultProblem(input.Result) is { } problem)
                return Invalid(problem);
            if (ChartProblem(input.Chart) is { } badChart)
                return Invalid(badChart);
            var title = string.IsNullOrWhiteSpace(input.Title) ? input.Question.Trim() : input.Title.Trim();
            var widget = new Widget(Guid.NewGuid().ToString("n"), input.Board, title.Length > MaxTitle ? title[..MaxTitle] : title,
                input.Question.Trim(), input.Answer, input.Result, DateTimeOffset.Now, input.FetchedAt, input.Details, input.Chart);
            await store.ChangeAsync(UserOf(context), w => { w.Widgets.Add(widget); return true; }, ct);
            return Results.Created($"/api/workspace/widgets/{widget.Id}", widget);
        });

        // Refresh: the same question answered again on the latest data replaces the widget's answer and rows.
        group.MapPut("/widgets/{id}", async (string id, WidgetRefresh input, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
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

        // Rename: the heading shown on the card. The question it asks again on refresh stays the same.
        group.MapPut("/widgets/{id}/title", async (string id, WidgetRename input, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.Title) || input.Title.Trim().Length > MaxTitle)
                return Invalid($"'title' is required, up to {MaxTitle} characters.");
            var updated = await store.ChangeAsync(UserOf(context), w =>
            {
                var index = w.Widgets.FindIndex(x => x.Id == id);
                if (index < 0)
                    return null;
                w.Widgets[index] = w.Widgets[index] with { Title = input.Title.Trim() };
                return w.Widgets[index];
            }, ct);
            return updated is null ? NotFound("widget") : Results.Ok(updated);
        });

        group.MapDelete("/widgets/{id}", async (string id, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
            await store.ChangeAsync(UserOf(context), w => w.Widgets.RemoveAll(x => x.Id == id), ct) > 0
                ? Results.NoContent()
                : NotFound("widget"));

        // One widget, for its own page (opened in a new tab from the board).
        group.MapGet("/widgets/{id}", async (string id, HttpContext context, WorkspaceStore store, CancellationToken ct) =>
            (await store.ReadAsync(UserOf(context), ct)).Widgets.Find(w => w.Id == id) is { } widget
                ? Results.Ok(widget)
                : NotFound("widget"));

        // ---------- Shared insights (anyone signed in can open one by its link) ----------

        // Shares a copy of one of the signed-in user's widgets as it is now, without its query; who shared it is the
        // signed-in user. The link works for Workspace:ShareDays days (30 unless set).
        group.MapPost("/shares", async (ShareInput input, HttpContext context, WorkspaceStore store, ShareStore shares, CancellationToken ct) =>
        {
            var widget = (await store.ReadAsync(UserOf(context), ct)).Widgets.Find(w => w.Id == input.WidgetId);
            if (widget is null)
                return NotFound("widget");
            var now = DateTimeOffset.Now;
            var share = new SharedInsight(Guid.NewGuid().ToString("n"), widget.Board, widget.Title, widget.Question, widget.Answer,
                widget.Result, widget.Details is { } details ? details with { Sql = null } : null,
                widget.FetchedAt ?? widget.CreatedAt, UserOf(context), now, now.AddDays(ShareDays()), widget.Chart);
            await shares.SaveAsync(share, ct);
            return Results.Created($"/api/workspace/shares/{share.Id}", share);
        });

        // 410 once the link has expired (shares made before links expired count from when they were shared).
        group.MapGet("/shares/{id}", async (string id, ShareStore shares, CancellationToken ct) =>
        {
            if (await shares.FindAsync(id, ct) is not { } share)
                return NotFound("shared insight");
            var expires = share.ExpiresAt ?? share.SharedAt.AddDays(ShareDays());
            return expires <= DateTimeOffset.Now
                ? Results.Problem($"This shared link expired on {expires:ddd d MMM yyyy}. Ask {share.SharedBy} to share it again.",
                    statusCode: StatusCodes.Status410Gone)
                : Results.Ok(share with { ExpiresAt = expires, Details = share.Details is { } d ? d with { Sql = null } : null });
        });

        // ---------- Table reviews (shared by everyone; the reviewer is the signed-in user) ----------

        group.MapGet("/reviews", async (ReviewStore reviews, CancellationToken ct) => Results.Ok((await reviews.AllAsync(ct)).Values));

        group.MapGet("/reviews/{tableId}", async (string tableId, ReviewStore reviews, CancellationToken ct) =>
            (await reviews.AllAsync(ct)).TryGetValue(tableId, out var review) ? Results.Ok(review) : NotFound("review for that table"));

        group.MapPut("/reviews/{tableId}", async (string tableId, ReviewInput input, HttpContext context, ReviewStore reviews, CancellationToken ct) =>
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
    }

    /// The signed-in user name: the sign-in cookie's only claim (see Access).
    static string UserOf(HttpContext context) => context.User.Identity?.Name ?? "";
    static IResult Invalid(string problem) => Results.Problem(problem, statusCode: StatusCodes.Status400BadRequest);
    static IResult NotFound(string what) => Results.Problem($"No {what} with that id.", statusCode: StatusCodes.Status404NotFound);

    /// Why a widget's result can't be kept, or null: it must be Analytics' { columns, rows, truncated }, not too large.
    static string? ResultProblem(JsonElement? result) =>
        result is { } r && (r.ValueKind != JsonValueKind.Object
            || !r.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Array
            || rows.GetArrayLength() > MaxWidgetRows)
            ? $"'result' must be an object with columns and rows, at most {MaxWidgetRows} rows."
            : null;

    /// Why a widget's chart can't be kept, or null: it must be one of Charts.All, or null for the UI to pick.
    static string? ChartProblem(string? chart) =>
        chart is null || Charts.All.Contains(chart) ? null : $"'chart' must be one of {string.Join(", ", Charts.All)}, or null.";

    static Schedule Build(string id, ScheduleInput input, DateTimeOffset createdAt, DateTimeOffset updatedAt) => new(
        id, input.Name!.Trim(), input.Question!.Trim(), input.Frequency!, input.Time!, input.StartsOn!,
        input.Frequency == Frequencies.Weekly ? input.DayOfWeek : null,
        input.Frequency is Frequencies.Monthly or Frequencies.Quarterly ? input.DayOfMonth : null,
        input.Enabled ?? true, input.Board, input.Answer, createdAt, updatedAt);
}
