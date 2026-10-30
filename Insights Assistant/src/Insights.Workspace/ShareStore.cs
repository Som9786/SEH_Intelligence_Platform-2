using System.Text.Json;
using System.Text.RegularExpressions;

namespace Insights.Workspace;

/// Keeps shared insights, one file each (shares/<id>.json under Workspace:DataPath), since anyone signed in can open
/// one and each carries its rows. Written like a workspace: temporary file first. A share never changes once written.
public sealed partial class ShareStore(WorkspaceStore workspace)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    string Folder => Path.Combine(workspace.Folder, "shares");

    public async Task SaveAsync(SharedInsight share, CancellationToken ct)
    {
        Directory.CreateDirectory(Folder);
        var file = Path.Combine(Folder, $"{share.Id}.json");
        var temporary = file + ".tmp";
        await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(share, Json), ct);
        File.Move(temporary, file, overwrite: true);
    }

    /// The share with that id, or null. Ids are the 32 hex characters SaveAsync was given, nothing else reaches a path.
    public async Task<SharedInsight?> FindAsync(string id, CancellationToken ct)
    {
        if (!Id().IsMatch(id))
            return null;
        var file = Path.Combine(Folder, $"{id}.json");
        if (!File.Exists(file))
            return null;
        await using var stream = File.OpenRead(file);
        return await JsonSerializer.DeserializeAsync<SharedInsight>(stream, Json, ct);
    }

    [GeneratedRegex("^[0-9a-f]{32}$")]
    private static partial Regex Id();
}
