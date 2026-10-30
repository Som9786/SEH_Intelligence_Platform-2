using System.Text.Json;

namespace Insights.Gateway.Workspace;

/// A table's review: someone's sign-off on its catalog metadata. Everyone sees the same review, so they are kept in one
/// shared file (reviews.json under Workspace:DataPath), not in a user's workspace.
public sealed record TableReview(string TableId, string Status, string Comment, string ReviewedBy, DateTimeOffset UpdatedAt);

/// Body of PUT /reviews/{tableId}. Who reviewed is the signed-in user, never taken from the body.
public sealed record ReviewInput(string? Status, string? Comment);

public static class ReviewStatuses
{
    public static readonly string[] All = ["verified", "needs-attention"];
}

/// Reads and writes reviews.json the same way WorkspaceStore writes a workspace: whole file, temporary file first.
public sealed class ReviewStore(WorkspaceStore workspace)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    readonly SemaphoreSlim gate = new(1, 1);

    string File => Path.Combine(workspace.Folder, "reviews.json");

    public async Task<Dictionary<string, TableReview>> AllAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            return await LoadAsync(ct);
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
            reviews[review.TableId] = review;
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

    async Task<Dictionary<string, TableReview>> LoadAsync(CancellationToken ct)
    {
        if (!System.IO.File.Exists(File))
            return new(StringComparer.OrdinalIgnoreCase);
        await using var stream = System.IO.File.OpenRead(File);
        var reviews = await JsonSerializer.DeserializeAsync<Dictionary<string, TableReview>>(stream, Json, ct);
        return new(reviews ?? [], StringComparer.OrdinalIgnoreCase);
    }
}
