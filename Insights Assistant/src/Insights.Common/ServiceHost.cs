using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.WindowsServices;

namespace Insights.Common;

/// Creates each service's builder, so the same build runs from a terminal (dotnet run, or the .exe) or as a Windows service.
public static class ServiceHost
{
    public static WebApplicationBuilder CreateBuilder(string[] args)
    {
        // Windows starts a service in System32, so its files (appsettings, logs, App_Data, the catalog) would be looked for
        // there; as a service they're read from the folder it's installed in. From a terminal nothing changes.
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            ContentRootPath = WindowsServiceHelpers.IsWindowsService() ? AppContext.BaseDirectory : null,
        });
        // Tells Windows when the service has started and stops it cleanly; does nothing outside a service.
        builder.Host.UseWindowsService();
        return builder;
    }
}
