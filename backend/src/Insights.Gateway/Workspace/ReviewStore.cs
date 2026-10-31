using System.Text.Json;

namespace Insights.Gateway.Workspace;

/// A table's review: someone's sign-off on its catalog metadata. Everyone sees the same review, so they are kept in one
/// shared file (reviews.json under Workspace:DataPath), not in a user's workspace. Database is the catalog database the
/// table belongs to (its folder name in DB Catalog), since two databases can have a table of the same name.
public sealed record TableReview(
    string TableId, string Status, string Comment, string ReviewedBy, DateTimeOffset UpdatedAt, string? Database = null);

/// Body of PUT /reviews/{tableId}. Who reviewed is the signed-in user, never taken from the body.
public sealed record ReviewInput(string? Status, string? Comment);

public static class ReviewStatuses
{
    public static readonly string[] All = ["verified", "needs-attention"];
}

/// Reads and writes reviews.json the same way WorkspaceStore writes a workspace: whole file, temporary file first. Each
/// review is kept under "database/tableId". Reviews saved before the catalog held more than one database have no database;
/// they belong to Workspace:ReviewsDatabase, and are saved with it the next time the file is written.
public sealed class ReviewStore(WorkspaceStore workspace, IConfiguration configuration)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    readonly SemaphoreSlim gate = new(1, 1);

    string File => Path.Combine(workspace.Folder, "reviews.json");

    /// The database a request that names none is about, and the one older reviews belong to.
    public string? DefaultDatabase => configuration["Workspace:ReviewsDatabase"] is { Length: > 0 } d ? d : null;

    /// One database's reviews, by table id.
    public async Task<Dictionary<string, TableReview>> AllAsync(string database, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            return (await LoadAsync(ct)).Values.Where(r => string.Equals(r.Database, database, StringComparison.OrdinalIgnoreCase))
                .ToDictionary(r => r.TableId, StringComparer.OrdinalIgnoreCase);
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<TableReview> SaveAsync(TableReview review, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            var reviews = await LoadAsync(ct);
            reviews[Key(review)] = review;
            Directory.CreateDirectory(workspace.Folder);
            var temporary = File + ".tmp";
            await System.IO.File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(reviews, Json), ct);
            System.IO.File.Move(temporary, File, overwrite: true);
            return review;
        }
        finally
        {
            gate.Release();
        }
    }

    static string Key(TableReview review) => review.Database is null ? review.TableId : $"{review.Database}/{review.TableId}";

    async Task<Dictionary<string, TableReview>> LoadAsync(CancellationToken ct)
    {
        var all = new Dictionary<string, TableReview>(StringComparer.OrdinalIgnoreCase);
        if (!System.IO.File.Exists(File))
            return all;
        await using var stream = System.IO.File.OpenRead(File);
        var reviews = await JsonSerializer.DeserializeAsync<Dictionary<string, TableReview>>(stream, Json, ct);
        foreach (var review in (reviews ?? []).Values)
        {
            var owned = review.Database is null && DefaultDatabase is { } d ? review with { Database = d } : review;
            all[Key(owned)] = owned;
        }
        return all;
    }
}
