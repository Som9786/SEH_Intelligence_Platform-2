SEH Intelligence Platform
=========================

Requirements: Node.js 18 or later (https://nodejs.org), and the backend services running
(Insights.Gateway, and DB Catalog, Analytics and AI Hub behind it). The app holds no data files itself.

1. Start the services and the gateway (http://localhost:5000 by default).
2. Start the app:
     Windows:        double-click start.cmd
     macOS / Linux:  ./start.sh
3. Open http://localhost:8080/ and sign in.

Options (add after start.cmd / ./start.sh):
  --port 9000        use another port (default 8080)
  --host 0.0.0.0     let other machines on the network open the app
  --api <url>        the gateway's address (default http://localhost:5000)

If DB Catalog has no catalog the app says so. Fix DB Catalog's catalog and select Retry.

The gateway can also serve this folder itself, with no Node.js or IIS: set Gateway:UiPath
in its appsettings.json to this folder and open the gateway's address.
Stop the app with Ctrl+C in its window.

Hosting on IIS instead (no Node.js needed)
------------------------------------------
1. Install the IIS URL Rewrite module: https://www.iis.net/downloads/microsoft/url-rewrite
   and Application Request Routing, with "Enable proxy" turned on in its server settings:
   https://www.iis.net/downloads/microsoft/application-request-routing
2. In IIS Manager, add a website (or use Default Web Site) whose physical path is this folder.
   Host it at the site root (http://server/ or http://server:8080/), not as a sub-application.
3. If the gateway isn't at http://localhost:5000, change the "API gateway" rule in web.config.
The included web.config forwards /api to the gateway, handles page routes, file types
and caching, and hides the Node files.
