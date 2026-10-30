# SEH Intelligence Platform

A web app for exploring a retail business's data. You can ask questions about sales and baskets in plain English, browse the database catalog, and keep answers as widgets on capability boards.

| Folder | What it is |
|---|---|
| [SEH Intelligence Platform/](SEH%20Intelligence%20Platform) | The UI: React, TypeScript and Vite. |
| [Insights Assistant/](Insights%20Assistant) | The backend: five .NET 9 services. See its [README](Insights%20Assistant/README.md) for how they work, their endpoints and settings. |

## Prerequisites

- [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0) and [Node.js 20.19+ or 22+](https://nodejs.org/) (with npm).
- **PostgreSQL** on `localhost:5432`, with the `pos_basket` database loaded. It holds the sales data.
- **Neo4j 5+**, with the `knowledge-model` and `db-guide` databases. On the team's machines this is the Neo4j Desktop instance `salespoc`: start it and wait for **RUNNING**.
- An **OpenAI API key**.

Run these once, from the `Insights Assistant` folder. They keep the passwords and the key outside the project:

```powershell
dotnet user-secrets set "Neo4j:Password"     "<neo4j password>"    --project src/Insights.Analytics
dotnet user-secrets set "PosBasket:Password" "<postgres password>" --project src/Insights.Analytics
dotnet user-secrets set "Neo4j:Password"     "<neo4j password>"    --project src/Insights.DbGuide
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

**Signing in:** the demo user is `Admin`. Users, passwords and roles are under `Gateway:Users` and `Gateway:Roles` in [Insights.Gateway/appsettings.json](Insights%20Assistant/src/Insights.Gateway/appsettings.json). Change the password before showing it outside the team.

## What runs where

| Address | What |
|---|---|
| http://localhost:5174 | The UI (Vite dev server). It passes `/api` on to the gateway. |
| http://localhost:5000 | **Gateway**: sign-in, access checks, and the only way in to the services below. `/health` shows which services are up. |
| http://localhost:5100 | **Analytics**: answers questions about the sales data with read-only SQL on PostgreSQL. |
| http://localhost:5200 | **AI Hub**: the AI calls, and routes each question to Analytics or DB Guide. |
| http://localhost:5300 | **DB Guide**: answers questions about the database's tables and joins. |
| http://localhost:5400 | **Workspace**: each user's schedules, board widgets and shared links. |

## Starting them by hand

To start them one at a time instead, use one terminal each:

```powershell
cd "Insights Assistant"
dotnet run --project src/Insights.Analytics
dotnet run --project src/Insights.AiHub
dotnet run --project src/Insights.DbGuide
dotnet run --project src/Insights.Workspace
dotnet run --project src/Insights.Gateway

cd "SEH Intelligence Platform"
npm install   # first time only
npm run dev
```

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
- **Answers fail with an AI error:** check the OpenAI key on AI Hub.
- **The page looks out of date after an update:** do a hard refresh (Ctrl+F5).
