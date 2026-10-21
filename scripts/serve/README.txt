SEH Intelligence Platform
=========================

Requirements: Node.js 18 or later (https://nodejs.org). Nothing else to install.

1. Copy the catalog files into the catalog folder:
     catalog/database.json, relationships.json, business-areas.json
     and every documents/table file that database.json lists.
2. Start the app:
     Windows:        double-click start.cmd
     macOS / Linux:  ./start.sh
3. Open http://localhost:8080/ and sign in.

Options (add after start.cmd / ./start.sh):
  --port 9000        use another port (default 8080)
  --host 0.0.0.0     let other machines on the network open the app

If the catalog folder is empty the app says so. Copy the files in and select Retry.
Stop the app with Ctrl+C in its window.

Hosting on IIS instead (no Node.js needed)
------------------------------------------
1. Install the IIS URL Rewrite module: https://www.iis.net/downloads/microsoft/url-rewrite
2. In IIS Manager, add a website (or use Default Web Site) whose physical path is this folder.
   Host it at the site root (http://server/ or http://server:8080/), not as a sub-application.
3. Copy the catalog files into the catalog folder.
The included web.config handles page routes, file types and caching, and hides the Node files.
