using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Insights.Workspace;

/// Keeps each user's schedules and widgets in a JSON file of their own under Workspace:DataPath. Every change reads the
/// file, applies the change and writes it back whole (to a temporary file first, so a crash never leaves half a file).
public sealed partial class WorkspaceStore(IConfiguration configuration, IWebHostEnvironment environment)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    // One change at a time: a handful of users, and each change is a small file.
    readonly SemaphoreSlim gate = new(1, 1);

    public string Folder { get; } =
        Path.GetFullPath(Path.Combine(environment.ContentRootPath, configuration["Workspace:DataPath"] ?? "App_Data"));

    public async Task<UserWorkspace> ReadAsync(string user, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            return await LoadAsync(user, ct);
        }
        finally
        {
            gate.Release();
        }
    }

    /// Applies a change to the user's workspace and saves it. The change returns what the caller gets back.
    public async Task<T> ChangeAsync<T>(string user, Func<UserWorkspace, T> change, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            var workspace = await LoadAsync(user, ct);
            var result = change(workspace);
            Directory.CreateDirectory(Folder);
            var file = FileOf(user);
            var temporary = file + ".tmp";
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(workspace, Json), ct);
            File.Move(temporary, file, overwrite: true);
            return result;
        }
        finally
        {
            gate.Release();
        }
    }

    async Task<UserWorkspace> LoadAsync(string user, CancellationToken ct)
    {
        var file = FileOf(user);
        if (!File.Exists(file))
            return new UserWorkspace();
        await using var stream = File.OpenRead(file);
        return await JsonSerializer.DeserializeAsync<UserWorkspace>(stream, Json, ct) ?? new UserWorkspace();
    }

    /// "Admin" -> admin-<hash>.json: readable, safe as a file name, and distinct for names that differ only in symbols.
    string FileOf(string user)
    {
        var name = user.Trim().ToLowerInvariant();
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(name)))[..8].ToLowerInvariant();
        var safe = Unsafe().Replace(name, "_");
        return Path.Combine(Folder, $"{(safe.Length > 40 ? safe[..40] : safe)}-{hash}.json");
    }

    [GeneratedRegex("[^a-z0-9._-]")]
    private static partial Regex Unsafe();
}
