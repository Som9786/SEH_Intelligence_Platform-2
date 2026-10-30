using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace Insights.Gateway;

/// What a signed-in user is shown by GET /api/auth/me: their roles and the functionalities those roles give.
public sealed record SignedInUser(string Username, IReadOnlyList<string> Roles, IReadOnlyList<string> Features);

/// Who may sign in and what they may use, from GatewayOptions.Users and Roles. The sign-in cookie holds only the
/// user name, so a change to a user's roles, or their removal, applies on their next request.
public static class Access
{
    /// The configured user with this user name and password, or null. User names ignore case; passwords don't.
    public static GatewayUser? Verify(GatewayOptions options, string? username, string? password)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrEmpty(password))
            return null;
        var user = Find(options, username.Trim());
        // Compared as hashes in fixed time, so the time taken says nothing about the password.
        var given = SHA256.HashData(Encoding.UTF8.GetBytes(password));
        var expected = SHA256.HashData(Encoding.UTF8.GetBytes(user?.Password ?? ""));
        return CryptographicOperations.FixedTimeEquals(given, expected) && !string.IsNullOrEmpty(user?.Password) ? user : null;
    }

    /// The configured user the request is signed in as, or null when it isn't (or the user was removed).
    public static SignedInUser? Current(GatewayOptions options, ClaimsPrincipal principal)
    {
        if (principal.Identity?.IsAuthenticated != true || Find(options, principal.Identity.Name) is not { } user)
            return null;
        var features = user.Roles
            .SelectMany(role => options.Roles.TryGetValue(role, out var granted) ? granted : [])
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        return new SignedInUser(user.Username, user.Roles, features);
    }

    /// True when the user has one of the functionalities, or the rule is "*" (anyone signed in).
    public static bool Allows(SignedInUser user, IReadOnlyList<string> features) =>
        features.Any(f => f == "*" || user.Features.Contains(f, StringComparer.OrdinalIgnoreCase));

    private static GatewayUser? Find(GatewayOptions options, string? username) =>
        options.Users.FirstOrDefault(u => string.Equals(u.Username, username, StringComparison.OrdinalIgnoreCase));
}
