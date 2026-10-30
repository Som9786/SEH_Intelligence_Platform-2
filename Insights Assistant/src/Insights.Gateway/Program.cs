using System.Security.Claims;
using System.Threading.RateLimiting;
using Insights.Gateway;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Yarp.ReverseProxy.Configuration;
using Yarp.ReverseProxy.Transforms;

// The one entry point for the SEH Intelligence Platform: the built UI at the site root, sign-in at /api/auth, and
// /api/db-guide, /api/analytics, /api/ai and /api/workspace passed on to DB Guide, Analytics, AI Hub and Workspace, for signed-in users, for the
// routes Gateway:Allow lists only, and only when one of the user's roles has the functionality the route is for.
var builder = WebApplication.CreateBuilder(args);
builder.Services.Configure<GatewayOptions>(builder.Configuration.GetSection(GatewayOptions.SectionName));
builder.Services.AddReverseProxy().LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    // Tells the service who is signed in. Any X-User the browser sent is dropped first, so it can't be faked.
    .AddTransforms(transforms => transforms.AddRequestTransform(context =>
    {
        context.ProxyRequest.Headers.Remove("X-User");
        var options = context.HttpContext.RequestServices.GetRequiredService<IOptionsMonitor<GatewayOptions>>().CurrentValue;
        if (Access.Current(options, context.HttpContext.User) is { } user)
            context.ProxyRequest.Headers.TryAddWithoutValidation("X-User", user.Username);
        return ValueTask.CompletedTask;
    }));
builder.Services.AddHttpClient("health", c => c.Timeout = TimeSpan.FromSeconds(5));
builder.Services.AddProblemDetails();

// The UI and the API share one address, so the sign-in is a cookie the browser sends with every /api call; the page's
// script can't read it (HttpOnly) and other sites can't make the browser send it (SameSite=Strict).
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "seh.auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
        // An API: answer 401 and 403 instead of redirecting to a sign-in page.
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });
// Slows down password guessing: 10 sign-in attempts a minute per client address.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("sign-in", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();
app.UseExceptionHandler();
app.UseAuthentication();
app.UseRateLimiter();

if (app.Services.GetRequiredService<IOptions<GatewayOptions>>().Value.Users.Count == 0)
    app.Logger.LogWarning("Gateway:Users is empty, so nobody can sign in");

var auth = app.MapGroup("/api/auth");
auth.MapPost("/sign-in", async (SignInRequest request, HttpContext context, IOptionsMonitor<GatewayOptions> options) =>
{
    var user = Access.Verify(options.CurrentValue, request.Username, request.Password);
    if (user is null)
        return Results.Problem("Incorrect username or password.", statusCode: StatusCodes.Status401Unauthorized);
    var identity = new ClaimsIdentity([new Claim(ClaimTypes.Name, user.Username)], CookieAuthenticationDefaults.AuthenticationScheme);
    var principal = new ClaimsPrincipal(identity);
    await context.SignInAsync(principal);
    return Results.Ok(Access.Current(options.CurrentValue, principal));
}).RequireRateLimiting("sign-in");
auth.MapPost("/sign-out", async (HttpContext context) =>
{
    await context.SignOutAsync();
    return Results.NoContent();
});
auth.MapGet("/me", (ClaimsPrincipal principal, IOptionsMonitor<GatewayOptions> options) =>
    Access.Current(options.CurrentValue, principal) is { } user
        ? Results.Ok(user)
        : Results.Problem("Not signed in.", statusCode: StatusCodes.Status401Unauthorized));

// Every other /api call: signed in (401), listed in Gateway:Allow (404), and for a functionality one of the user's
// roles has (403). Only then is it passed on; anything refused here never reaches a service.
app.UseWhen(c => c.Request.Path.StartsWithSegments("/api") && !c.Request.Path.StartsWithSegments("/api/auth"),
    api => api.Use(async (context, next) =>
    {
        var options = context.RequestServices.GetRequiredService<IOptionsMonitor<GatewayOptions>>().CurrentValue;
        if (Access.Current(options, context.User) is not { } user)
        {
            await Results.Problem("Sign in first.", statusCode: StatusCodes.Status401Unauthorized).ExecuteAsync(context);
            return;
        }
        var segments = context.Request.Path.Value!.Split('/', 4, StringSplitOptions.RemoveEmptyEntries);
        var service = segments.Length > 1 ? segments[1] : "";
        var path = segments.Length > 2 ? string.Join('/', segments[2..]) : "";
        var features = ApiAllowList.Find(options, context.Request.Method, service, path);
        if (features is null)
        {
            await Results.Problem($"{context.Request.Method} {context.Request.Path} isn't available.",
                statusCode: StatusCodes.Status404NotFound).ExecuteAsync(context);
            return;
        }
        if (!Access.Allows(user, features))
        {
            await Results.Problem($"Your role doesn't include {string.Join(" or ", features)}.",
                statusCode: StatusCodes.Status403Forbidden).ExecuteAsync(context);
            return;
        }
        await next();
    }));

// The gateway and each service it passes on to, so one call shows whether the whole platform is up.
app.MapGet("/health", async (IProxyConfigProvider proxy, IHttpClientFactory clients, CancellationToken ct) =>
{
    var checks = proxy.GetConfig().Clusters.Select(async cluster =>
    {
        var address = cluster.Destinations?.Values.FirstOrDefault()?.Address;
        try
        {
            using var response = await clients.CreateClient("health").GetAsync(new Uri(new Uri(address!), "health"), ct);
            return (cluster.ClusterId, Ok: response.IsSuccessStatusCode, Detail: $"{(int)response.StatusCode} from {address}");
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or UriFormatException or ArgumentNullException)
        {
            return (cluster.ClusterId, Ok: false, Detail: $"not reachable at {address}");
        }
    });
    var services = await Task.WhenAll(checks);
    return Results.Ok(new
    {
        ok = services.All(s => s.Ok),
        services = services.ToDictionary(s => s.ClusterId, s => new { ok = s.Ok, detail = s.Detail }),
    });
});

app.MapReverseProxy();
// Any other /api path (such as /api/auth/unknown) is a 404 here, never the UI's index.html.
app.Map("/api/{**_}", () => Results.Problem("Not found.", statusCode: StatusCodes.Status404NotFound));

// The built UI, when there is one. Paths that aren't files (/table-details, /relationships) get index.html, because
// the UI routes in the browser. The Node launcher and IIS files that npm run package adds are never served.
var uiPath = app.Configuration[$"{GatewayOptions.SectionName}:UiPath"];
var uiFolder = string.IsNullOrWhiteSpace(uiPath) ? null : Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, uiPath));
if (uiFolder is not null && File.Exists(Path.Combine(uiFolder, "index.html")))
{
    string[] hidden = ["serve.mjs", "start.cmd", "start.sh", "README.txt", "web.config"];
    app.Use(async (context, next) =>
    {
        var file = context.Request.Path.Value?.TrimStart('/') ?? "";
        if (hidden.Contains(file, StringComparer.OrdinalIgnoreCase))
            context.Response.StatusCode = StatusCodes.Status404NotFound;
        else
            await next();
    });
    var files = new PhysicalFileProvider(uiFolder);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = files });
    app.MapFallbackToFile("index.html", new StaticFileOptions { FileProvider = files });
    app.Logger.LogInformation("Serving the UI from {Folder}", uiFolder);
}
else
{
    app.Logger.LogInformation("No UI at {Folder}; serving the API only", uiFolder ?? "(Gateway:UiPath is empty)");
}

app.Run();

internal sealed record SignInRequest(string? Username, string? Password);
