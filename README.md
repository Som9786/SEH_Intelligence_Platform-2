# SEH Intelligence Platform

A web app for exploring a retail business's data. You can ask questions about sales and baskets in plain English, browse the database catalog, and keep answers as widgets on capability boards.

| Folder | What it is |
|---|---|
| [frontend/](frontend) | The UI: React, TypeScript and Vite. |
| [backend/](backend) | The backend: four .NET 9 services. See its [README](backend/README.md) for how they work, their endpoints and settings. |

## Prerequisites

- [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0) and [Node.js 20.19+ or 22+](https://nodejs.org/) (with npm).
- **PostgreSQL** on `localhost:5432`, with the `pos_basket` database loaded. It holds the sales data. The data and the script that loads it aren't in the repo: get the `temp` folder from the team (see the [backend README](backend/README.md#local-only-files-temp)).
  - **Or SQL Server**, with a copy of `pos_basket`: set `PosBasket:Provider` to `SqlServer` in [Insights.Analytics/appsettings.json](backend/src/Insights.Analytics/appsettings.json) and restart Analytics. See [Choosing the database](backend/README.md#choosing-the-database-postgresql-or-sql-server).
- **Neo4j 5+**, with the `knowledge-model` and `db-guide` databases. On the team's machines this is the Neo4j Desktop instance `salespoc`: start it and wait for **RUNNING**.
- An **AWS Bedrock API key** (the AI Hub's default, `Llm:Provider` = `Bedrock`), or an **OpenAI API key** with `Llm:Provider` set to `OpenAI`.

Run these once, from the `backend` folder. They keep the passwords and the key outside the project:

```powershell
dotnet user-secrets set "Neo4j:Password"     "<neo4j password>"    --project src/Insights.Analytics
dotnet user-secrets set "PosBasket:Password" "<postgres password>" --project src/Insights.Analytics
dotnet user-secrets set "Neo4j:Password"     "<neo4j password>"    --project src/Insights.DbCatalog
dotnet user-secrets set "Bedrock:ApiKey"     "<bedrock api key>"   --project src/Insights.AiHub
# or, with Llm:Provider set to OpenAI:
dotnet user-secrets set "OpenAI:ApiKey"      "<openai key>"        --project src/Insights.AiHub
```

## Start everything

From this folder, with PostgreSQL and Neo4j running:

```powershell
.\start-all.ps1
```

The script:

1. Builds and starts each service in its own window.
2. Starts the UI. The first run installs its packages.
3. Waits until the gateway reports every service as ready.
4. Opens http://localhost:5174.

Services that are already running are left as they are, so running it again starts only what's missing.

- **Options:** `-NoBrowser` skips opening the browser, and `-NoUi` starts only the services.
- **Stopping:** `.\stop-all.ps1` stops everything. Closing a service's window stops just that one.
- **If Windows blocks the script**, run `powershell -ExecutionPolicy Bypass -File .\start-all.ps1`.

**Signing in:** the demo user is `Admin`. Users, passwords and roles are under `Gateway:Users` and `Gateway:Roles` in [Insights.Gateway/appsettings.json](backend/src/Insights.Gateway/appsettings.json). Change the password before showing it outside the team.

## What runs where

| Address | What |
|---|---|
| http://localhost:5174 | The UI (Vite dev server). It passes `/api` on to the gateway. |
| http://localhost:5000 | **Gateway**: sign-in, access checks, and the only way in to the services below. Sends each question to Analytics or DB Catalog, and keeps each user's schedules, board widgets and shared links, and the table reviews (`/api/workspace`). `/health` shows which services are up. |
| http://localhost:5100 | **Analytics**: answers questions about the sales data with read-only SQL on PostgreSQL, or SQL Server (`PosBasket:Provider`). |
| http://localhost:5200 | **AI Hub**: the AI calls (OpenAI or Amazon Bedrock). It calls no other service. |
| http://localhost:5300 | **DB Catalog**: answers questions about the database's tables and joins. |

## Starting them by hand

To start them one at a time instead, use one terminal each:

```powershell
cd backend
dotnet run --project src/Insights.Analytics
dotnet run --project src/Insights.AiHub
dotnet run --project src/Insights.DbCatalog
dotnet run --project src/Insights.Gateway

cd frontend
npm install   # first time only
npm run dev
```

## Running as Windows services (VDI or server)

Each service can run as a Windows service, so it starts with Windows and keeps running after you sign out. As a service it reads its files (appsettings, logs, `App_Data`, the catalog) from the folder it's installed in.

1. **Publish** each service into its own folder, and build the UI. The machine then needs only the [.NET 9 ASP.NET Core Runtime](https://dotnet.microsoft.com/download/dotnet/9.0), not the SDK.
   ```powershell
   cd backend
   foreach ($s in 'Gateway', 'Analytics', 'AiHub', 'DbCatalog') {
       dotnet publish "src/Insights.$s" -c Release -o "C:\SEH\$s"
   }
   cd ..\frontend; npm run build   # then copy dist to C:\SEH\ui
   ```
2. **Gateway settings:** in `C:\SEH\Gateway\appsettings.json`:
   - Set `Gateway:UiPath` to `C:\SEH\ui`, so the gateway serves the app.
   - Set `Urls` to `http://0.0.0.0:5000` if other machines should open it.

   The other services stay on `localhost`.
3. **Secrets:** user-secrets aren't read outside Development, so set them as machine environment variables, as an administrator:
   ```powershell
   [Environment]::SetEnvironmentVariable('Neo4j__Password',     '<neo4j password>',    'Machine')
   [Environment]::SetEnvironmentVariable('PosBasket__Password', '<postgres password>', 'Machine')
   [Environment]::SetEnvironmentVariable('Bedrock__ApiKey',     '<bedrock api key>',   'Machine')   # or OpenAI__ApiKey with Llm:Provider = OpenAI
   ```
   To read the data from SQL Server, also set `PosBasket__Provider` to `SqlServer`. A service runs as Local System, so Windows sign-in reaches SQL Server as the machine account: give that account read access to `pos_basket`, or set `PosBasket__SqlServer__ConnectionString` to one with a SQL login.
4. **Install and start** them, as an administrator:
   ```powershell
   foreach ($s in 'Analytics', 'AiHub', 'DbCatalog', 'Gateway') {
       sc.exe create "SEH-$s" binPath= "C:\SEH\$s\Insights.$s.exe" start= auto
       sc.exe start "SEH-$s"
   }
   ```
5. **Check:** http://localhost:5000/health should show every service as ok, and http://localhost:5000 opens the app. If other machines will connect, open port 5000 in the Windows firewall.

To update, stop the services (`sc.exe stop SEH-<name>`), publish over their folders, and start them again. To remove one, use `sc.exe delete SEH-<name>`.

## Working on the UI

From `SEH Intelligence Platform`:

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 5174, which reloads as you edit. |
| `npm run lint`, `npm run typecheck`, `npm test` | Checks and unit tests. Run them before committing. |
| `npm run build` | The production build, written to `dist/`. |

## When something doesn't start

- **The start script lists a service as down:** check that service's window for the error. Usually PostgreSQL or Neo4j isn't running, or a password or key isn't set.
- **"Port already in use":** something else is on that port. Run `.\stop-all.ps1`, then start again.
- **Answers fail with an AI error:** check the Bedrock key (or the OpenAI key, with `Llm:Provider` = `OpenAI`) on AI Hub. A short-term Bedrock key expires after 12 hours.
- **The page looks out of date after an update:** do a hard refresh (Ctrl+F5).
