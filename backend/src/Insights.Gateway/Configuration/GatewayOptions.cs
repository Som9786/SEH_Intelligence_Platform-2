namespace Insights.Gateway.Configuration;

public sealed class GatewayOptions
{
    public const string SectionName = "Gateway";

    /// The built UI folder, served at the site root. Empty, or a folder that doesn't exist, serves the API only.
    public string UiPath { get; set; } = "";

    /// The people who can sign in. Passwords are plain text for now (see appsettings.json).
    public List<GatewayUser> Users { get; set; } = [];

    /// Per role, the functionalities (the UI's pages, such as "db-catalog") its users can open.
    public Dictionary<string, List<string>> Roles { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    /// Per service (the name after /api/), the "METHOD path" rules reachable from outside, each with the
    /// functionalities that may use it ("db-catalog, insights-assistant"), or "*" for anyone signed in.
    /// A trailing * in the path matches the rest.
    public Dictionary<string, Dictionary<string, string>> Allow { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class GatewayUser
{
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public List<string> Roles { get; set; } = [];
}
