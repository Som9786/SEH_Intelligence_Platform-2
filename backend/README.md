# Insights: POS Basket Analytics POC

Lets people ask questions about point-of-sale (POS) basket data in plain English. **Neo4j holds only the knowledge model**: what each business term means, where it lives in PostgreSQL, how things join, the agreed metric formulas, the business rules and verified examples. **The data itself always comes from PostgreSQL**, or from a copy of it in SQL Server (see [Choosing the database](#choosing-the-database-postgresql-or-sql-server)). For each question, the part of the knowledge model it's about goes to an AI model, which writes one read-only SQL query in that database's dialect; the query runs there, and the AI explains the rows.

| Data | Where | What |
|---|---|---|
| POS baskets (one week today: 2026-08-16 to 2026-08-22) | PostgreSQL `pos_basket`, table `public.pos_basket_line`; or SQL Server `pos_basket`, table `dbo.pos_basket_line` (`PosBasket:Provider`) | One row per scanned line. Read live for every question. |
| Knowledge model | Neo4j database `knowledge-model` | Tables, columns, concepts (Store, Basket, BasketLine, Item, Offer), relationships, metrics, synonyms, business rules and examples. Loaded from three JSON files. |
| Database catalog for [DB Catalog](#db-catalog) | Neo4j database `db-guide` | The `SEH_Validation_Retail` SQL Server database's tables, columns, joins, indexes, rules and documentation, from its metadata export. DB Catalog answers questions about the database's structure from it. |

**Contents:** [Quick start](#quick-start) · [How it works](#how-it-works) · [Q&A page](#qa-page) · [The knowledge model](#the-knowledge-model) · [DB Catalog](#db-catalog) · [Endpoints](#endpoints) · [Choosing the database](#choosing-the-database-postgresql-or-sql-server) · [Configuration](#configuration) · [Debug log](#debug-log) · [Project structure](#project-structure) · [Local-only files](#local-only-files-temp) · [Troubleshooting](#troubleshooting) · [Scope and limits](#scope-and-limits)

## Quick start

**Prerequisites:** the [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0), PostgreSQL with the `pos_basket` database loaded (see [Local-only files](#local-only-files-temp)), Neo4j 5 or later, and an OpenAI API key or Amazon Bedrock access (see [Choosing OpenAI or Bedrock](#choosing-openai-or-bedrock)).

1. **Start the databases.** PostgreSQL on `localhost:5432`, and Neo4j. On the team's machines Neo4j runs in **Neo4j Desktop 2** as the local instance `salespoc`: start it with ▶ and wait for **RUNNING**.
2. **Create the `knowledge-model` database** once. In Neo4j Desktop open **Query**, connect to `salespoc`, select the `system` database and run ``CREATE DATABASE `knowledge-model` IF NOT EXISTS`` (the backticks are needed because of the dash). (Neo4j Community has only one database: set `Neo4j:Database` to `neo4j` instead.)
3. **Store the passwords** with user-secrets, which keeps them outside the project folder:
   ```powershell
   dotnet user-secrets set "Neo4j:Password"     "<neo4j password>"    --project src/Insights.Analytics
   dotnet user-secrets set "PosBasket:Password" "<postgres password>" --project src/Insights.Analytics
   dotnet user-secrets set "OpenAI:ApiKey"      "<openai key>"        --project src/Insights.AiHub
   ```
   Environment variables also work: `Neo4j__Password`, `PosBasket__Password`, `OpenAI__ApiKey` or `OPENAI_API_KEY`.

   To use Amazon Bedrock instead of OpenAI, set `Llm:Provider` to `Bedrock` in [src/Insights.AiHub/appsettings.json](src/Insights.AiHub/appsettings.json) and store the Bedrock API key:
   ```powershell
   dotnet user-secrets set "Bedrock:ApiKey"     "<bedrock api key>"   --project src/Insights.AiHub
   ```
4. **Run both services**, each in its own terminal:
   ```powershell
   dotnet run --project src/Insights.Analytics   # http://localhost:5100
   dotnet run --project src/Insights.AiHub      # http://localhost:5200
   ```
   They can start in either order. Analytics loads the knowledge model into Neo4j at startup (a few seconds).
5. **Open http://localhost:5100/** and ask a question or pick a suggested one. There's nothing to load or sync: new data in PostgreSQL is in the next answer.
6. **Optional: DB Catalog**, for questions about a database's tables and joins (see [DB Catalog](#db-catalog)). It needs only Neo4j and AI Hub:
   ```powershell
   dotnet user-secrets set "Neo4j:Password" "<neo4j password>" --project src/Insights.DbCatalog
   dotnet run --project src/Insights.DbCatalog   # http://localhost:5300
   ```
7. **Run the gateway**, the one entry point for the SEH Intelligence Platform UI and any other client:
   ```powershell
   dotnet run --project src/Insights.Gateway   # http://localhost:5000
   ```
   It passes `/api/db-catalog/*`, `/api/analytics/*` and `/api/ai/*` on to the three services, but only the routes `Gateway:Allow` in its appsettings.json lists; everything else (raw SQL, logs, reloads, AI Hub's SQL and answer calls) stays internal. Two parts it answers itself: `/api/ai/ask` (it asks AI Hub which service a question is for, then asks that service; see [How it works](#how-it-works)) and `/api/workspace`. `GET /health` checks all three services. Outside Development it also serves the built UI from `Gateway:UiPath` (`frontend/dist`), so the whole platform is one address.

8. **The workspace** keeps each user's schedules, board widgets and shared insights, and the table reviews. It's part of the gateway (`src/Insights.Gateway/Workspace`, files under `src/Insights.Gateway/App_Data`), so it runs when the gateway does and always knows the signed-in user. (Before, it was part of DB Catalog; to keep saved work from then, copy `src/Insights.DbCatalog/App_Data/admin-*.json`, `reviews.json` and `shares/` to `src/Insights.Gateway/App_Data`.)

   Through the gateway at `/api/workspace`: `GET`/`POST /schedules`, `PUT`/`DELETE /schedules/{id}` (`{ name, question, frequency: daily|weekly|monthly|quarterly, time: "HH:mm", startsOn: "yyyy-MM-dd", dayOfWeek, dayOfMonth, enabled, board, answer }`; responses add `nextRunAt`), and `GET /widgets?board=`, `POST /widgets` (`{ board, title, question, answer, result }`; `title` is the heading on the card, the question when left out), `PUT /widgets/{id}/title` (`{ title }`, to rename it), `DELETE /widgets/{id}`. Schedules are saved and shown but not run yet; widgets keep the answer as it was when added.

   **Sign-in and roles.** Every `/api` call needs a sign-in: `POST /api/auth/sign-in` with `{ "username", "password" }` sets an HttpOnly cookie (8 hours, renewed while in use), `GET /api/auth/me` returns the user with their roles and functionalities, and `POST /api/auth/sign-out` ends it. The users are in `Gateway:Users` (for now one, `Admin`, with a plain-text password in appsettings.json: change it, and move it to user-secrets or an environment variable such as `Gateway__Users__0__Password` before going live). `Gateway:Roles` lists the functionalities (the UI's pages: `db-catalog`, `insights-assistant`, ...) each role can use; each `Gateway:Allow` rule names the functionalities that may call it (`*` for anyone signed in). The gateway answers 401 when not signed in, 404 for a route that isn't listed, and 403 when the user's roles don't include it; the UI shows only the user's pages. Changes to these settings apply without a restart.

Other ways in: **Swagger UI** at http://localhost:5100/swagger and http://localhost:5200/swagger (Development only, which `dotnet run` uses), and [requests.http](requests.http), which has a ready-made request for every endpoint (VS Code **REST Client** extension or Visual Studio).

**Upgrading from the version that copied the data into Neo4j:** that copy is no longer used. The old `posbasket` Neo4j database is left as it was; drop it when you no longer need it (`DROP DATABASE posbasket` on the `system` database).

## How it works

| Project | Port | Talks to | Purpose |
|---|---|---|---|
| [src/Insights.Gateway](src/Insights.Gateway) | 5000 | Analytics, AI Hub, DB Catalog | The **one entry point** for the SEH Intelligence Platform UI and other clients: sign-in, roles, the routes `Gateway:Allow` lists, the built UI. It answers `/api/ai/ask` itself (AI Hub says which service a question is for, then the gateway asks that service), and keeps the **workspace** (`/api/workspace`): each user's saved work (schedules, widgets, shared insights) and the table reviews, in files (`App_Data/`). |
| [src/Insights.Analytics](src/Insights.Analytics) | 5100 | Neo4j (knowledge model), PostgreSQL or SQL Server `pos_basket` (data), AI Hub | Loads the knowledge model into Neo4j, picks the part of it each question is about, runs read-only SQL on the data, and serves the Q&A page. It forwards the Q&A page's AI requests to AI Hub (`/ai/*`), sending each question's knowledge model context along, and answers data questions end to end (`/ask`). |
| [src/Insights.AiHub](src/Insights.AiHub) | 5200 | The model only (OpenAI or Amazon Bedrock) | The shared AI service: turns English questions into SQL, query results into English answers, and catalog context into answers about a database's structure (`/guide`); tells which service a question is for (`/intent`) and suggests what to ask next (`/follow-ups`) and what to do about an answer (`/recommendations`). It **calls no other service**: each caller sends the context its prompt needs. New AI features for other apps or datasets go here. |
| [src/Insights.DbCatalog](src/Insights.DbCatalog) | 5300 | Neo4j (catalog), AI Hub | Loads a database's metadata export into Neo4j and answers questions about its structure: which table to use, how to join, what a column means. Its page is the UI's DB Catalog. See [DB Catalog](#db-catalog). |
| [src/Insights.Common](src/Insights.Common) | – | – | Code the services share: the debug log, the AI Hub client connection, word matching (`Terms`) and the question rules. |

In this README they're called **Analytics** and **AI Hub** for short.

```
UI / other clients ──► Gateway (sign-in, roles, allowed routes)
                          ├─► /api/analytics/*, /api/db-catalog/*, /api/ai/* ──► passed on to the service
                          ├─► /api/workspace/* ──► answered by the gateway (App_Data/)
                          └─► /api/ai/ask ──► AI Hub POST /intent (with what each service answers) ──► the model
                                         └─► Analytics or DB Catalog POST /ask, as the intent says

Startup, or knowledge-model.json / business-rules.json / query-examples.json saved
           ──► Analytics ──► replaces the knowledge model in Neo4j (one transaction)

POST /ask  ──► Analytics ──► Neo4j: the question's part of the knowledge model
                    ├─► AI Hub POST /sql (question + that context) ──► the model: writes one SELECT
                    ├─► PostgreSQL or SQL Server, read-only ──► rows
                    └─► AI Hub POST /answer ──► the model: plain-English answer
```

Calls only go one way: Gateway → Analytics or DB Catalog → AI Hub → the model. No service calls back into the one that called it, so a slow step holds one request, not a chain of them.

- **The graph holds meaning, not data.** Neo4j stores what "net sales", "basket" or "bought together" mean and where they live in PostgreSQL. Answers are always computed from PostgreSQL, so they're never out of date and there's nothing to sync.
- **Focused prompts.** A question's words are matched against the knowledge model's names and synonyms. The AI gets the concepts and metrics it names, the concepts on the shortest relationship path between them (so it sees how they join), their tables and columns, the business rules about them, and up to 5 examples that illustrate the most of them. "Net sales by store" gets Store, Basket, BasketLine and Net sales, not offers or items. A question that names nothing in the knowledge model gets all of it.
- **Clear boundaries.** AI Hub never connects to a database or another service, and only AI Hub calls the model (OpenAI or Bedrock; see [Choosing OpenAI or Bedrock](#choosing-openai-or-bedrock)).
- **Two ways to ask.** `/ask` does the whole question in one call. The Q&A page instead calls `/ai/sql`, `/query` and `/ai/answer` one at a time, so it can show progress and let you edit and rerun the query.

## Q&A page

http://localhost:5100/ is served by Analytics from [src/Insights.Analytics/wwwroot/index.html](src/Insights.Analytics/wwwroot/index.html). It only calls Analytics.

- **Chat:** type a question and the page shows the plain-English answer, a chart when the rows suit one, and **How this was answered**: the AI's description of the query, **Knowledge model used** (the concepts and metrics the AI was given), the generated SQL (editable, with **Run edited query**), the raw rows and **Download CSV**. Status pills at the top right show the **AI service** (the model and today's cost against the daily budget, or offline), the **Knowledge model** (Neo4j; green when loaded) and the **Data** (PostgreSQL or SQL Server; green when reachable); hover for details.
- **Charts:** a **line** for a series over time (dates, hours), with a tab per measure and a crosshair tooltip; a **network** for pairs such as items bought together (hover a node to highlight its links); **bars** for a short list of label/number pairs. When several fit, tabs switch between them.
- **Follow-ups:** questions such as “and only on Thursday?” build on the last three questions and their queries, and keep their part of the knowledge model. **New chat** clears the chat and starts fresh.
- **Self-correcting:** if the database rejects the AI's query, the page sends the error back to the AI once and runs its corrected query; the answer says “query corrected after a database error”.
- **Rating:** 👍 / 👎 under each answer saves a rating (`POST /feedback`). After 👍, **Save as example** adds the question and its query to `query-examples.json`, so the AI reuses it for similar questions.
- **Explain with AI:** a switch under the question box, on by default and remembered per browser. Off skips the AI's plain-English explanation: the answer is the chart and table (a single value shows as one line), which cuts a question's model cost by about two thirds. `/ask` takes the same option as `"explain": false`.
- **Cost line:** each answer shows its step times and model cost, or “reused, no model cost” when AI Hub answered from its cache.
- **Right column:** the same height as the chat, with five cards, **one open at a time**. **Hide panel** (top right) collapses the column to an icon rail; click an icon to reopen it on that card. The open card and the collapsed state are remembered per browser.

| Card | What it shows |
|---|---|
| Suggested questions | Example questions for this dataset (from `/dataset`); click one to ask it |
| Recent questions | The last 30 questions asked in this browser (kept in `localStorage`); click one to ask it again |
| Knowledge model | What the knowledge model holds (concepts, metrics, rules, examples, tables, columns), how the concepts relate, each concept's meaning, and the **last load** (time and counts, or the error), with **Reload knowledge model** |
| Data boundary | What is sent to the model, what stays local, what is saved on this machine, and what can change data |
| Debug log | Both services' step-by-step logs, merged by time (see [Debug log](#debug-log)) |

## The knowledge model

Three files in `src/Insights.Analytics`, not code, describe the data. Analytics loads them into Neo4j **at startup and whenever one of them is saved** (no restart), replacing the previous knowledge model in one transaction: a question reads either the old knowledge model or the new one, never half of each. If a file has a problem, such as a concept stored in a table that isn't listed, the load is refused with every problem named, Neo4j keeps the previous knowledge model, and the **Knowledge model** card shows the error.

| File | Holds |
|---|---|
| [knowledge-model.json](src/Insights.Analytics/knowledge-model.json) | **Tables** (the only tables questions may read, with each column's type, meaning and known values), **concepts** (business things, each stored in a table with a key and attributes, which are SQL expressions over its columns, plus the synonyms people use), **relationships** between concepts with how to join them in SQL, and **metrics** (the agreed SQL formula for each measure, the concepts it measures, and its synonyms) |
| [business-rules.json](src/Insights.Analytics/business-rules.json) | The data owner's **business rules** (how to count baskets, what counts as net or gross sales, leaving department sales out of item rankings, and more). Each rule names the concepts and metrics it `AppliesTo`, and goes to the AI only with questions about them; a rule without `AppliesTo` goes with every question. |
| [query-examples.json](src/Insights.Analytics/query-examples.json) | **Verified example questions with their SQL.** Each is linked to the concepts and metrics its question names, and the AI gets the ones closest to its question. **Save as example** on the Q&A page adds to it. |

[suggested-questions.json](src/Insights.Analytics/suggested-questions.json) holds the dataset's name and the **suggested questions** on the Q&A page. It isn't part of the knowledge model, and the AI never sees it.

```jsonc
// knowledge-model.json (shortened)
{ "KnowledgeModel": {
    "Tables":   [ { "Name": "public.pos_basket_line", "DateColumn": "transaction_end_date", "Columns": [ { "Name": "str_num", "Type": "integer", "Description": "Store number." }, ... ] } ],
    "Concepts": [ { "Name": "Store", "Table": "public.pos_basket_line", "Key": "str_num", "Synonyms": [ "store", "shop", ... ],
                    "Attributes": [ { "Name": "storeNumber", "Expression": "str_num" } ] }, ... ],
    "Relationships": [ { "Name": "HAS_BASKET", "From": "Store", "To": "Basket", "Join": "Same table: every line of a basket carries its store's str_num." }, ... ],
    "Metrics":  [ { "Name": "Net sales", "Expression": "sum(amount)", "Concepts": [ "BasketLine" ], "Synonyms": [ "sales", "revenue", ... ] }, ... ] } }

// business-rules.json
{ "Dataset": { "BusinessRules": [ { "Text": "A basket is one checkout ... count(DISTINCT idtuuid) ...", "AppliesTo": [ "Basket", "Basket count" ] }, ... ] } }
```

**In Neo4j** every knowledge model node has the label `KnowledgeModel` plus one of these:

```
(Concept)-[:STORED_IN]->(Table)-[:HAS_COLUMN]->(Column)
(Concept)-[:HAS_ATTRIBUTE]->(Attribute)-[:READS]->(Column)
(Concept)-[:RELATES {name, join}]->(Concept)          HAS_BASKET, HAS_LINE, OF_ITEM, APPLIES_OFFER, BOUGHT_WITH
(Metric)-[:MEASURES]->(Concept)       (Metric)-[:READS]->(Column)
(Term)-[:MEANS]->(Concept | Metric)                   every name and synonym, normalized
(Rule)-[:APPLIES_TO]->(Concept | Metric)
(Example)-[:ILLUSTRATES]->(Concept | Metric)
```

A load replaces only nodes labelled `KnowledgeModel`, so anything else in the database is left alone. Words are matched after lowercasing and a naive singular (`stores` → `store`, `categories` → `category`), the same way for synonyms and questions. To see it, open Neo4j Browser on the `knowledge-model` database and run `MATCH (n:Concept)-[r:RELATES]->(m) RETURN n, r, m`, or `CALL db.schema.visualization()`.

**Writing good entries:**
- **Synonyms decide relevance.** If a question uses a word that isn't any concept's or metric's synonym, its concept isn't matched; add the word. Phrases of up to four words work ("number of baskets").
- **Rules:** one or two plain sentences naming the columns they're about, with `AppliesTo` set to the concepts or metrics they affect.
- **Examples** improve answers more than anything else. Save good answers with **Save as example**, or edit the file.
- **New tables:** list them under `Tables` before any concept uses them. Only listed tables can be queried.

## DB Catalog

[src/Insights.DbCatalog](src/Insights.DbCatalog) answers questions about a **database's structure**, not its data: "Which table should I use for product data?", "How do I join order items to products?", "Which columns are sensitive?". It works the same way as the knowledge model, with a different source: the graph is built from the database's **metadata export** (catalog), and answers come from the graph alone. The database itself is never connected to. When a query helps, the answer includes an example query for you to run.

```
Startup ──► DB Catalog ──► loads every database folder in catalog/ into Neo4j db-guide
A file in catalog/<database>/ changed ──► DB Catalog ──► replaces that database's catalog (one transaction)

POST /ask ──► DB Catalog ──► Neo4j: the tables the question is about, and the joins between them
                  └─► AI Hub POST /guide (question + that catalog context) ──► OpenAI: answer + example query
```

**Open http://localhost:5300/.** The page has the chat (answer, the tables it uses, the example query with **Copy**, and **How this was answered**), and cards for suggested questions, the **Catalog** (every table by business area, with its columns, joins, rules, indexes and documentation page, and a filter), the **Join map** (tables coloured by business area; solid lines are foreign keys, dashed lines are links the database doesn't enforce), and recent questions.

| File | Holds |
|---|---|
| `catalog/<database>/` | One folder per database, named after it (`catalog/SEH_Validation_Retail/`). The name is how the API and the UI's database picker refer to it. Each holds the metadata export, as the export tool writes it: `database.json`, `business-areas.json`, `relationships.json`, `tables/*.json` (columns, keys, indexes, constraints, triggers, business rules) and `documentation/*.md`. To add a database, copy its export into a new folder; to remove one, delete its folder. Either is picked up without a restart. |
| `catalog/<database>/db-catalog.json` | That database's page name and suggested questions, and **synonyms**: extra words for a table (`"inventory.Products": ["item", "sku"]`), column (`inventory.Products.UnitPrice`) or business area. Add one when a question uses a word the export doesn't. Optional; without it the page is named after the folder. |

`Catalog:DefaultDatabase` (appsettings.json) is the database used when a request names none: the routes without `/databases/{database}`, and the Insights Assistant's questions. Empty means the first folder by name.

**In Neo4j** (database `db-guide`, created on the first load when it doesn't exist; on Neo4j Community, which has only the database `neo4j`, set `Neo4j:Database` to `neo4j`) every node has the label `Catalog` and a `db` property naming its database folder. Several databases share the graph; ids are unique within a database:

```
(Database)-[:HAS_AREA]->(BusinessArea)-[:HAS_TABLE]->(Table)-[:HAS_COLUMN]->(Column)
(Table)-[:JOINS {condition, enforced, cardinality, meaning}]->(Table)      from the referencing table
(Column)-[:REFERENCES {enforced}]->(Column)
(Table)-[:HAS_INDEX]->(Index)   (Table)-[:HAS_CONSTRAINT]->(Constraint)   (Table)-[:HAS_TRIGGER]->(Trigger)
(Rule)-[:APPLIES_TO]->(Table)
(Term)-[:MEANS]->(Table | Column | BusinessArea)                         every name and synonym, normalized
```

Plus a full-text index, `catalog_text`, over what each table and column means. To look at it, open Neo4j Browser on `db-guide` and run `MATCH (a:Table)-[j:JOINS]->(b) RETURN a, j, b`.

**How a question picks its tables:** its words are matched against table names and synonyms (strongest), column names and synonyms (weaker when many tables share the name, such as `Email`), and business areas, and the full-text index finds tables and columns whose meaning matches ("where is the price including tax?"). Up to 6 of the best-scoring tables are kept, and the tables on the shortest chain of joins (up to 3) between each pair are added. The AI gets those tables in full, the join paths, and the other tables in brief. A question that picks nothing gets every table in brief. `POST /context` shows exactly what the AI gets.

| Endpoint | Body | Returns |
|---|---|---|
| `GET /databases` | – | `[{ name, title, default, lastLoad }]`: every database folder, its page name, whether it's the default, and its last load |
| `POST /ask` | `{ "question": "...", "history": [{ "question", "answer" }], "database": "..." }` | `{ question, answer, tables, sql, matched, given, joinPaths, usage, cached }`. `answer` is Markdown; `sql` is an example query (not run) or empty; `matched` says which tables the question pointed at and why; `given` lists the tables the AI got. `history` (optional) makes it a follow-up; `database` (optional) picks the database, else the default. |
| `POST /context` | `{ "question": "...", "history": [...], "database": "..." }` | The catalog context for the question, as sent to AI Hub |
| `GET /databases/{database}/catalog` | – | The database, counts, business areas, every table in brief, and every join with its SQL condition |
| `GET /databases/{database}/catalog/tables/{id}` | – | One table in full, with its documentation page. `id` is schema-qualified: `sales.Orders`. **404** if there's no such table. |
| `GET /databases/{database}/catalog/files/{path}` | – | One file the database's `database.json` publishes, as the UI reads it |
| `GET /databases/{database}/catalog/status` / `POST …/catalog/reload` | – | The last load `{ at, succeeded, error, counts }` / load again. **500** "Catalog error" names every problem with the export or `db-catalog.json`. |
| `GET /databases/{database}/guide` | – | `{ name, suggestions }` from the database's `db-catalog.json` |
| `GET /health` | – | `{ catalog: { ok, detail }, ai: { ok, detail }, model }`: the catalog is ok when every database loaded |

Each `/databases/{database}/…` route also answers without that prefix (`GET /catalog`, `GET /guide`, …) for the default database. An unknown database is a **404** that lists the ones there are.
| `GET /guide` | – | The page's name and suggested questions |
| `GET /ai/usage` | – | AI Hub's model cost totals, passed through |

**What goes to the model:** the question and the catalog context (table and column names, types, descriptions, joins, indexes, constraints, triggers and business rules). No data rows. The documentation pages (which include the export's masked sample and profile summaries) are stored in Neo4j and shown on the page, but never sent to the model; column descriptions can still mention a typical value, such as a status's possible values. Each question costs about one US cent with `gpt-5` at low reasoning effort; a repeated question is answered from AI Hub's cache.

## Endpoints

### Insights.Analytics (http://localhost:5100)

| Endpoint | Body | Returns |
|---|---|---|
| `GET /schema` | – | The whole knowledge model from Neo4j: `dialect` (`PostgreSQL` or `SQL Server`), `coverage` (`{ from, to }`: the first and last business date in the data, or null), `tables` with `columns`, `concepts` with `attributes`, `relationships`, `metrics`, `rules` and `examples` |
| `POST /context` | `{ "question": "...", "history": ["earlier question", ...] }` | The same shape, narrowed to the question: what Analytics sends with each AI Hub `/sql` call, for its prompt. `matched` lists the concepts and metrics its words named; it's empty when nothing matched and the whole knowledge model is returned. |
| `GET /knowledge-model/status` | – | The last load: `{ at, succeeded, error, counts }`. **404** before the first load. |
| `POST /knowledge-model/reload` | – | Loads the three files into Neo4j again and returns the status. Saving a file does this by itself. **500** "Knowledge model error" with every problem when a file is invalid. |
| `GET /health` | – | `{ knowledge model: { ok, detail }, data: { ok, detail }, coverage }`: whether Neo4j holds a loaded knowledge model and the data's database answers |
| `GET /dataset` | – | Dataset name and suggested questions |
| `POST /query` | `{ "sql": "..." }` | `{ columns, rows, truncated }`. Rows are capped at `Query:MaxRows` (default 1000). |
| `POST /ask` | `{ "question": "...", "history": [{ "question", "sql" }] }` | `{ question, answerable, sql, explanation, result, answer, costUsd, corrected, knowledge model }`: the whole flow in one call. `history` (optional, oldest first) makes it a follow-up. If the database rejects the generated query, the AI corrects it once (`corrected: true`); if that fails too, the 400 response includes the query as `sql`. |
| `POST /feedback` / `GET /feedback` | `{ "question", "sql", "answer", "rating": "up" \| "down", "comment" }` | Saves a rating to `App_Data/feedback.jsonl` / lists the newest (`?count=`, default 100) |
| `POST /recommend` | `{ "question": "...", "sql": "...", "answer": "...", "result": <the /ask response's result> }` | `{ recommendations, dataNote, baselineSql, costUsd }`: what to do about an answer. Asks for a baseline first (the same rows next to the chain average and, with two weeks of data or more, the previous period, written by AI Hub `/sql` as a follow-up to the answer's query and run read-only), then AI Hub `/recommendations` with it, the dates the data covers and the question's business rules. Without a baseline (its query failed), the actions come from the rows alone. Fewer than 2 rows get no actions and no model call. The UI asks for these after showing the answer. |
| `GET /examples` / `POST /examples` / `DELETE /examples?question=` | `{ "question", "sql" }` | Lists, adds (or replaces, by question) or removes a verified example in `query-examples.json`, for the database in use: on SQL Server the example is saved with `"Dialect": "SQL Server"`, beside the PostgreSQL one. A query the SQL guard refuses can't be saved. |
| `POST /ai/sql` | as AI Hub `/sql`, without `context` | Forwarded to AI Hub `/sql`, with the question's knowledge model context (as `/context` returns it) added |
| `POST /ai/answer` | as AI Hub `/answer` | Forwarded to AI Hub `/answer` |
| `GET /ai/health` | – | Forwarded to AI Hub `/health`: `{ status, model, provider }` |
| `GET /ai/usage` | – | Forwarded to AI Hub `/usage`: model calls, tokens and estimated cost so far (see [Model cost](#model-cost)) |
| `GET /logs?after=<id>` / `DELETE /logs` | – | Recent log entries from Analytics `{ enabled, lastId, entries, logFile }` / clears them |
| `GET /ai/logs?after=<id>` / `DELETE /ai/logs` | – | The same for AI Hub, forwarded |

**`/query` is read-only, in two layers:**
1. **The SQL guard** ([SqlGuard.cs](src/Insights.Analytics/Services/Query/SqlGuard.cs)) refuses, before anything reaches the database: more than one statement; anything but `SELECT` or `WITH … SELECT`; words that change data, schema, settings or transactions or lock rows (`INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`, `COPY`, `SET`, `SELECT … INTO`, `FOR UPDATE`, `EXPLAIN` and more, also inside a CTE); system catalogs and `pg_*` functions (`pg_read_file`, `pg_sleep`, …); functions that reach files or other servers, change settings or run SQL from a string (`lo_*`, `dblink`, `query_to_xml`, `set_config`, `nextval`, …); and any table after `FROM` or `JOIN` that isn't in the knowledge model (CTE names and functions such as `generate_series` are fine). It reads the SQL after removing comments and string literals (including `E'…'` and `$$…$$` strings), so they can't hide anything, and a word such as `'DELETE'` inside a value isn't a false alarm. On SQL Server it reads the SQL as SQL Server does (`[bracketed]` names; no `E'…'` or `$$` strings) and also refuses `EXEC`, `WAITFOR`, `DECLARE`, `DBCC`, `OPENROWSET`/`OPENQUERY`, `::fn()`, `sys.*`, `INFORMATION_SCHEMA`, the system databases, `xp_*`/`sp_*` procedures, and `#temp` tables or `@variables` after `FROM`.
2. **The database itself:** on PostgreSQL the query runs in a `READ ONLY` transaction with `statement_timeout` = `Query:TimeoutSeconds`. SQL Server has no read-only transaction: there the query runs with a command timeout of `Query:TimeoutSeconds`, and only the guard and the login's rights keep it read-only, so beyond a local POC use a login that is only in `db_datareader`. Either way the transaction is always rolled back.

Rejected queries return **400** "Query rejected"; queries the database refuses return **400** with its error (and PostgreSQL's hint; a query cancelled by the time limit says so), so the caller can show it or ask the AI again. **503** "PostgreSQL is not reachable", "SQL Server is not reachable" or "Neo4j is not reachable" names the database and the cause. AI Hub errors pass through with AI Hub's own status and message; if AI Hub can't be reached, `/ai/*` and `/ask` return **503**, and **504** if it takes longer than `AiHub:TimeoutSeconds`.

### Insights.AiHub (http://localhost:5200)

| Endpoint | Body | Returns |
|---|---|---|
| `POST /sql` | `{ "question": "...", "context": <Analytics /context response>, "history": [...], "failedSql": "...", "error": "..." }` | `{ answerable, sql, explanation, usage, cached, knowledge model }`. `context` is the question's part of the knowledge model, which the caller (Analytics) sends; **400** without it. If `answerable` is false, `sql` is empty and `explanation` says why. `history` (optional) makes it a follow-up; `failedSql` and `error` (optional) ask for a corrected query. `knowledge model` names the concepts and metrics the model was given. |
| `POST /answer` | `{ "question": "...", "sql": "...", "results": <Analytics /query response> }` | `{ answer, usage, cached }`, the answer in plain English |
| `POST /guide` | `{ "question": "...", "context": <DB Catalog /context response>, "history": [...] }` | `{ answer, tables, sql, usage, cached }`: an answer about a database's structure from the catalog context the caller sends. Used by DB Catalog; AI Hub never reads the catalog itself. |
| `POST /intent` | `{ "question": "...", "history": [{ "question", "intent" }], "analytics": { name, suggestions }, "dbCatalog": { name, suggestions } }` | `{ intent, reason, board, chart, usage, cached }`: whether the question is about the sales data (`analytics`), about the database's structure (`db-catalog`), or neither (`unclear`), and the capability board an answer about the data belongs on (`basket-intelligence`, `fresh-food-forecasting`, `revenue-opportunities` or `none`). One small model call. `analytics` and `dbCatalog` (optional) are what each service says it answers (Analytics `GET /dataset`, DB Catalog `GET /guide`), used as examples; the gateway adds them. |
| `POST /follow-ups` | `{ "question": "...", "intent": "analytics", "answer": "...", "columns": [...], "analytics": {...}, "dbCatalog": {...} }` | `{ questions, usage, cached }`: up to three questions to ask next, about the sales data or the database. The UI asks for these after showing the answer, so they never delay it. |
| `POST /recommendations` | `{ "question": "...", "answer": "...", "results": <Analytics /query response>, "baseline": <the same rows against a benchmark>, "from": "yyyy-MM-dd", "to": "yyyy-MM-dd", "rules": [...] }` | `{ recommendations: [{ action, why, owner, priority }], dataNote, usage, cached }`: up to three actions for an answer about the data, most pressing first, each quoting the gap from the rows or the baseline that calls for it, the team that would act and a priority (`high` for a gap of 25% or more, `medium` 10-25%, `low` less); none when nothing stands out. `dataNote` says what to bear in mind about the data itself (a partial last day, too few days for a trend). Used by Analytics' `/recommend`, which adds the baseline, dates and rules. |
| `GET /usage` | – | Model calls, tokens and estimated cost, in total and today, and the daily budget |
| `GET /health` | – | `{ status, model, provider }`. Doesn't call the model. |
| `GET /logs?after=<id>` / `DELETE /logs` | – | AI Hub's recent log entries / clears them |

AI Hub returns **500** for missing configuration (such as no API key), **502** for the model's errors, **503** when Bedrock can't be reached and **504** when the model doesn't answer in time.

**What goes to the model:** for `/sql`, the question and its knowledge model context (table and column descriptions, concept attributes, metric formulas, the matching business rules and examples, and the first and last date in the data); for `/answer`, the question, the SQL and the query rows (up to `Answer:MaxResultChars`). The POS data has no customer details.

### Insights.Gateway (http://localhost:5000)

Everything under `/api` needs a sign-in (see [Quick start](#quick-start), step 8) and a route `Gateway:Allow` lists. Most routes are passed on to a service as they are; these are answered by the gateway itself:

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/ai/ask` | `{ "question": "...", "history": [{ "question", "intent", "answer", "sql" }] }` | `{ question, intent, reason, board, chart, service, result, message, intentUsage, intentCached }`: asks AI Hub `/intent` which service the question is for, then asks Analytics or DB Catalog (`POST /ask`) and passes its response through in `result`. Each service is sent only its own earlier turns as history (`sql` for Analytics, `answer` for DB Catalog). An `unclear` question calls neither: `message` says what to ask instead. A failing service's error is passed on, with the intent in the `X-Intent` header. The one endpoint the UI's Insights Assistant needs. |
| `POST /api/ai/intent`, `POST /api/ai/follow-ups` | as AI Hub's, without `analytics` and `dbCatalog` | AI Hub's response; the gateway adds what each service answers (kept for 10 minutes) |
| `/api/workspace/*` | see [Quick start](#quick-start), step 8 | The signed-in user's schedules, widgets and shared insights, and the table reviews |
| `GET /health` | – | `{ ok, services: { ai, analytics, db-catalog } }` |

## Choosing the database: PostgreSQL or SQL Server

The POS data can be answered from PostgreSQL (the default) or from a copy of it in SQL Server. Switch in [src/Insights.Analytics/appsettings.json](src/Insights.Analytics/appsettings.json), then restart Analytics:

```json
"PosBasket": {
  "Provider": "SqlServer",
  ...
  "SqlServer": {
    "ConnectionString": "Server=localhost;Database=pos_basket;Integrated Security=true;TrustServerCertificate=true",
    "Schema": "dbo"
  }
}
```

`"Provider": "PostgreSQL"` switches back. The environment variable `PosBasket__Provider` does the same without editing the file (for a Windows service, for example). **Health** and the **Coverage** line under *Data behind this* name the database in use.

- **The SQL Server copy:** `backend/temp/db/pos_basket_sqlserver` (local only, see [Local-only files](#local-only-files-temp)) creates the `pos_basket` database and copies every row from PostgreSQL with the same columns, key and indexes, then checks that line, basket and store counts and the net amount match. Run it again to refresh the copy.
- **One knowledge model for both.** `knowledge-model.json` and `business-rules.json` stay written for PostgreSQL. On SQL Server, Analytics sends the AI the tables as `dbo.…`, SQL Server column types (`bit`, `uniqueidentifier`, …), and the formulas and rules translated to T-SQL (`FILTER (WHERE …)` → `CASE WHEN`, `extract(…)` → `DATEPART`, `to_char(…, 'FMDay')` → `DATENAME`, `::int` → `CAST`, `is_ebt` → `is_ebt = 1`; [SqlServerExpressions.cs](src/Insights.Analytics/Services/KnowledgeModel/SqlServerExpressions.cs)). AI Hub then asks for T-SQL (`TOP` rather than `LIMIT`, no `GROUP BY 1`, …).
- **Examples per database.** Each example in `query-examples.json` has a checked SQL Server version (`"Dialect": "SQL Server"`); the AI gets the version for the database in use, or the PostgreSQL one when there's no other. **Save as example** saves for the database in use.
- **Same answers.** The SQL Server versions of the examples and every metric return the same numbers as PostgreSQL.
- **On a machine with little free memory,** SQL Server keeps itself small and queries wait for memory. The copy adds a columnstore index (aggregates in about 1 s rather than over a minute), an index on `transaction_end_date`, and one CPU per query in that database (`MAXDOP 1`).

## Configuration

Settings are in each project's `appsettings.json`; `appsettings.Development.json` overrides them when developing (`dotnet run` uses the Development environment). Keep passwords and keys in user-secrets or environment variables (see [Quick start](#quick-start)), never in that file.

| Setting | Used by | Default | Notes |
|---|---|---|---|
| `Neo4j:Uri` / `User` / `Database` | Analytics | `neo4j://127.0.0.1:7687` / `neo4j` / `knowledge-model` | Where the knowledge model is loaded. A load replaces only nodes labelled `KnowledgeModel`. Use `127.0.0.1`, not `localhost` (see [Troubleshooting](#troubleshooting)). |
| `PosBasket:Provider` | Analytics | `PostgreSQL` | Which database every answer is read from: `PostgreSQL` or `SqlServer`. Restart Analytics after changing it. See [Choosing the database](#choosing-the-database-postgresql-or-sql-server). |
| `PosBasket:Host` / `Port` / `Database` / `User` | Analytics | `localhost` / `5432` / `pos_basket` / `postgres` | The PostgreSQL database. Password: `PosBasket:Password`. For anything beyond a local POC, use a user that can only `SELECT` from the knowledge model's tables. |
| `PosBasket:SqlServer:ConnectionString` | Analytics | `Server=localhost;Database=pos_basket;Integrated Security=true;TrustServerCertificate=true` | The SQL Server database, when `Provider` is `SqlServer`. Windows sign-in by default; with a SQL login, keep the connection string (it has the password) in user-secrets or `PosBasket__SqlServer__ConnectionString`. |
| `PosBasket:SqlServer:Schema` | Analytics | `dbo` | The schema the knowledge model's tables are in on SQL Server: `public.pos_basket_line` is read as `dbo.pos_basket_line`. |
| `Query:MaxRows` / `TimeoutSeconds` | Analytics | `1000` / `30` | Limits for `/query`; the timeout is PostgreSQL's `statement_timeout`, or SQL Server's command timeout |
| `AiHub:BaseUrl` / `TimeoutSeconds` | Analytics | `http://localhost:5200` / `180` | Where `/ai/*` and `/ask` go, and how long to wait for each call |
| `Llm:Provider` | AI Hub | `Bedrock` | `OpenAI` or `Bedrock`: which section below answers. Read on every call, so no restart is needed. |
| `OpenAI:Model` | AI Hub | *(empty)* | The model to use. When empty, `FallbackModel` is used. |
| `OpenAI:FallbackModel` | AI Hub | `gpt-5` | Also used if `Model` returns "model not found" (404) |
| `OpenAI:TimeoutSeconds` | AI Hub | `150` | How long one model call may take; keep it under `AiHub:TimeoutSeconds` |
| `OpenAI:ReasoningEffort` | AI Hub | `low` | `minimal`, `low`, `medium` or `high`, for reasoning models (gpt-5, o-series) only. Lower is faster and cheaper. Empty uses OpenAI's default (`medium`). |
| `OpenAI:DailyBudgetUsd` | AI Hub | `5` | Questions are refused (429) once today's OpenAI cost reaches this; `0` means no limit |
| `Cache:Enabled` / `MaxEntries` | AI Hub | `true` / `500` | Reuse the query for a repeated question while its knowledge model context is the same, and the answer for the same question, query and results, without calling OpenAI. Follow-ups and corrections are never cached. |
| `OpenAI:Prices` | AI Hub | gpt-5, gpt-5-mini, gpt-5-nano, gpt-4.1, gpt-4o families | US dollars per million input, cached input and output tokens, used to count cost (see [Model cost](#model-cost)) |
| `Bedrock:Region` | AI Hub | `eu-north-1` | The AWS region the model is enabled in |
| `Bedrock:ApiKey` / `AccessKeyId` / `SecretAccessKey` / `SessionToken` | AI Hub | *(empty)* | A Bedrock API key, or an IAM key pair. All empty: `AWS_BEARER_TOKEN_BEDROCK`, then the default AWS credentials (`AWS_PROFILE`, `~/.aws`, an instance role) |
| `Bedrock:Model` / `FallbackModel` | AI Hub | `eu.anthropic.claude-sonnet-4-6` / `eu.anthropic.claude-haiku-4-5-20251001-v1:0` (our AWS account also allows `eu.anthropic.claude-opus-5` there) | A model ID or inference profile ID that supports JSON schema output. The fallback is also used if `Model` isn't found or isn't enabled |
| `Bedrock:TimeoutSeconds` / `MaxTokens` / `Effort` | AI Hub | `150` / `8192` / `low` | Time limit for the whole call (retries and fallback included; keep it under `AiHub:TimeoutSeconds`), longest reply, and effort (`low` to `max`, empty for the model's default; dropped for a model that rejects it) |
| `Bedrock:DailyBudgetUsd` / `Prices` | AI Hub | `5` / Claude Sonnet 4.6, Opus 5, Sonnet 5 and Haiku 4.5 | As for OpenAI; a price key matches the model ID with or without the `us.` prefix. Check them against [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) |
| `Answer:MaxResultChars` | AI Hub | `50000` | Longer query results are cut before they're sent to the model |
| `Gateway:AskTimeoutSeconds` | Gateway | `300` | How long `/api/ai/ask` waits for Analytics or DB Catalog to answer |
| `Workspace:DataPath` / `ShareDays` | Gateway | `App_Data` / `30` | Where the workspace's files are kept, and how many days a shared insight's link works |
| `ReverseProxy:Clusters:*:Destinations` | Gateway | `http://localhost:5100/`, `5200/`, `5300/` | Where each service runs, for the proxy and for the gateway's own calls |
| `DebugLog:*` | Both | | See [Debug log](#debug-log) |
| `Knowledge model:*` (in `knowledge-model.json`) and `Dataset:*` (in `business-rules.json`, `query-examples.json` and `suggested-questions.json`) | Analytics | | See [The knowledge model](#the-knowledge-model) |

## Debug log

Both services log each step of what they do, at Information level:
- **Knowledge model:** each load with its counts, and for each question which concepts and metrics it named and what the AI was given.
- **Queries:** the SQL, rows and time, or why it was rejected.
- **`/ask`:** each step.
- **Data:** whether the data's database (PostgreSQL or SQL Server) answers, and the dates it covers.
- **Calls between the services:** every call from Analytics or DB Catalog to AI Hub, with status and time.
- **The model:** every OpenAI or Bedrock call, with model, time, tokens, finish or stop reason and cost.

### Choosing OpenAI or Bedrock

AI Hub calls one model service, chosen by `Llm:Provider` in its `appsettings.json`: `OpenAI` or `Bedrock` (the current setting). Everything else stays the same: the prompts, the JSON schemas the replies follow, the cache, the cost line and the daily budget. The budget and prices are the active provider's (`OpenAI:*` or `Bedrock:*`), and the running total in `App_Data/openai-usage.json` counts both.

Bedrock calls go to the [Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html) with structured output, so `Bedrock:Model` must be a model that supports a JSON schema response (recent Anthropic Claude models do). Enable the model in the Bedrock console for `Bedrock:Region` first, and copy its model ID or inference profile ID from there.

### Model cost

AI Hub counts the cost of its own model calls (OpenAI or Bedrock); it doesn't call a billing API, which needs an admin key. Each reply carries its token counts (input, cached input, output including reasoning), and AI Hub multiplies them by `OpenAI:Prices`.

- **Per answer:** `/ai/sql` and `/ai/answer` return a `usage` object, `/ask` returns `costUsd`, and the Q&A page shows `≈ $0.02 OpenAI` under each answer (hover it for the tokens).
- **Running total:** `GET /ai/usage`, and the AI service pill at the top of the page. It's saved in `src/Insights.AiHub/App_Data/openai-usage.json`, so it survives restarts; delete the file to start counting again.
- **Limits:** it's an estimate from list prices, and it counts only this app's calls, not other uses of the same API key. Update `OpenAI:Prices` when OpenAI changes its prices; a model with no price is counted as `unpricedCalls` without a cost.

Errors from anywhere in a service are captured too, with their root cause (not just the Neo4j driver's generic "make sure your database is online").

You can read the logs in three places:
- **The console.**
- **The Debug log card** on the Q&A page. It merges both services by time, refreshes every 2 seconds while open, and has a service filter, a **Follow** switch to stay on the newest entry, and **Clear**. It also shows where each log file is.
- **Daily log files**, one per service per day, with full stack traces:
  - `src/Insights.Analytics/logs/insights.analytics-yyyy-MM-dd.log`
  - `src/Insights.AiHub/logs/insights.aihub-yyyy-MM-dd.log`

| Setting (both services) | Default | Notes |
|---|---|---|
| `DebugLog:Enabled` | `false`, `true` in Development | Step-by-step logs. When off, only warnings and errors are logged. Takes effect **without a restart**. |
| `DebugLog:MaxEntries` | `1000` | Entries kept in memory for `/logs` and the card |
| `DebugLog:WriteToFile` | `true` | Write the daily log file. Takes effect without a restart. |
| `DebugLog:FileDirectory` | `logs` | Relative to the project folder. Read at startup. |
| `DebugLog:RetainedFileDays` | `7` | Older log files are deleted |

The logs include questions and generated SQL, but never query rows or passwords. So they're **off by default** (`appsettings.json`) and **on in Development** (`appsettings.Development.json`). Edit either file to switch them; warnings and errors are always logged.

## Project structure

```
backend/
├── Insights.sln
├── README.md, requests.http
├── src/
│   ├── Insights.Gateway/    the one entry point: sign-in and roles (Auth/), /api/ai/ask routing (Routing/), the workspace (Workspace/), the built UI
│   ├── Insights.Analytics/  knowledge model (Neo4j), read-only SQL (PostgreSQL or SQL Server), /ask, AI forwarding, Q&A page (wwwroot/)
│   ├── Insights.AiHub/      question + knowledge model context → SQL, rows → answer, catalog context → answer, intent (OpenAI or Bedrock)
│   ├── Insights.DbCatalog/  database catalog (Neo4j database db-guide) → answers about tables and joins, for the UI's DB Catalog pages
│   ├── Insights.Contracts/  the AI Hub's request and response records, shared by every service that calls it
│   └── Insights.Common/     code the services share: the debug log, the AI Hub connection, Terms, QuestionRules
└── temp/                local-only data and load scripts, not checked in
```

The services follow the same layout: thin controllers, logic in `Services/`, one options class per settings section, and all dependency-injection registrations in `Extensions/`.

**src/Insights.Analytics**

| Folder | Contents |
|---|---|
| `Controllers/` | `SchemaController` (`/schema`, `/context`), `KnowledgeModelController` (`/knowledge-model/status`, `/knowledge-model/reload`, `/dataset`), `HealthController` (`/health`), `QueryController` (`/query`), `AskController` (`/ask`), `RecommendController` (`/recommend`), `FeedbackController` (`/feedback`, `/examples`), `AiHubController` (`/ai/*`), `LogsController` (`/logs`) |
| `Services/Knowledge model/` | `KnowledgeModelLoader` (checks the files and writes the knowledge model to Neo4j), `KnowledgeModelReader` (the whole knowledge model, or a question's part of it), `KnowledgeModelWatcher` (loads at startup and when a file changes), `SqlServerExpressions` (the knowledge model's PostgreSQL formulas as T-SQL) |
| `Services/Query/` | `SqlQueryService` (read-only SQL on the data's database), `SqlGuard` (what may run, per dialect), `SqlValueConverter` (database values to JSON), `DatabaseErrors` (a failed query's error, and `QueryFailedException`) |
| `Services/Data/` | `PosBasketDatabase` (the PostgreSQL or SQL Server connection, table names and dialect), `DataCoverageService` (whether the database answers, and the dates it covers) |
| `Services/Dataset/` | `ExampleStore` (`query-examples.json`), `FeedbackStore` (ratings) |
| `Services/Ask/` | `AskService` (question → SQL → rows → answer), `RecommendService` (answer → baseline query → actions) |
| `Services/AiHub/` | `AiHubClient` (the AI Hub endpoints Analytics uses; adds each question's knowledge model context to `/sql`) |
| `Filters/` | `AiHubErrorFilter`: AI Hub errors, timeouts and failed `/ask` queries as problem responses. `DatabaseErrorHandler`: "Neo4j is not reachable", "PostgreSQL is not reachable" or "SQL Server is not reachable" (503) and "Knowledge model error" (500) with the cause, on any endpoint |
| `Models/`, `Configuration/`, `Extensions/` | Request and response records, options classes, `AddAnalytics()` |
| `wwwroot/` | The Q&A page |
| `knowledge-model.json`, `business-rules.json`, `query-examples.json` | The knowledge model (see [The knowledge model](#the-knowledge-model)) |
| `suggested-questions.json` | Dataset name and suggested questions on the Q&A page |

**src/Insights.AiHub**

| Folder | Contents |
|---|---|
| `Controllers/` | `SqlController` (`/sql`), `AnswerController` (`/answer`), `RecommendationController` (`/recommendations`), `GuideController` (`/guide`), `RoutingController` (`/intent`, `/follow-ups`), `HealthController` (`/health`), `UsageController` (`/usage`), `LogsController` (`/logs`) |
| `Services/Sql/` | `SqlGenerationService` and `SqlPrompt` (question + knowledge model context → SQL) |
| `Services/Answer/` | `AnswerService` and `AnswerPrompt` (rows → English) |
| `Services/Guide/` | `GuideService` and `GuidePrompt` (question + database catalog context → answer and example query, for DB Catalog `/guide`) |
| `Services/Routing/` | `IntentService` and `IntentPrompt` (which service a question is for), `FollowUpService` (what to ask next) |
| `Services/Llm/` | `LlmClient` (passes each call to `OpenAIChat` or `BedrockChat` by `Llm:Provider`; each applies its model fallback), `UsageTracker` (cost and daily budget), `ResponseCache` |
| `Filters/` | `UpstreamErrorFilter`: missing configuration and model errors as 500, 502, 503 and 504 |
| `Models/`, `Configuration/`, `Extensions/` | Request and response records, options classes, `AddAiHub()`. No CORS: only Analytics, DB Catalog and the gateway call AI Hub, server to server. |

**src/Insights.DbCatalog**

| Folder | Contents |
|---|---|
| `Controllers/` | `AskController` (`/ask`), `CatalogController` (`/databases`, `/catalog`, `/catalog/tables/{id}`, `/context`, `/catalog/status`, `/catalog/reload`, `/guide`, each also under `/databases/{database}`), `CatalogFilesController` (`/catalog/files/{path}`), `HealthController` (`/health`, `/ai/usage`) |
| `Services/Catalog/` | `CatalogFiles` (lists the database folders, reads and checks one's export), `CatalogLoader` (writes a database's catalog to Neo4j), `CatalogReader` (overview, one table, or a question's part of it, for one database), `CatalogWatcher` (loads every database at startup, and one again when a file in its folder changes) |
| `Services/Ask/`, `Services/AiHub/` | `AskService` (question → catalog context → AI Hub `/guide`), `AiHubClient` |
| `Filters/` | `ErrorHandler`: "Neo4j is not reachable" (503), "Unknown database" (404), "Catalog error" (500) and AI Hub errors as problem responses |
| `Models/`, `Configuration/`, `Extensions/` | The export's file formats (`CatalogExport`), request and response records, options classes, `AddDbCatalog()` |
| `catalog/<database>/` | One folder per database: its metadata export and its `db-catalog.json` (questions and synonyms; see [DB Catalog](#db-catalog)) |

**src/Insights.Gateway**

| Folder | Contents |
|---|---|
| `Program.cs` | The sign-in endpoints, the `/api` check, the proxy and the built UI |
| `Auth/` | `Access` (who may sign in, and what their roles give them), `ApiAllowList` (the `Gateway:Allow` rule for a request) |
| `Configuration/` | `GatewayOptions` |
| `Routing/` | `AskEndpoints` (`/api/ai/ask`, and `/api/ai/intent` and `/follow-ups` with the service profiles added), `ServiceProfiles` (what Analytics and DB Catalog answer) |
| `Workspace/` | `WorkspaceEndpoints` (`/api/workspace`), `WorkspaceStore`, `ShareStore`, `ReviewStore` (JSON files under `App_Data/`), `ScheduleRules` |

**src/Insights.Contracts** (class library, referenced by AI Hub and every service that calls it)

| File | Contents |
|---|---|
| `SqlContracts.cs`, `GuideContracts.cs`, `RoutingContracts.cs`, `LlmUsage.cs` | The bodies of AI Hub's `/sql`, `/answer`, `/guide`, `/intent` and `/follow-ups`, and their responses, in one place so the services can't drift apart |

**src/Insights.Common** (class library, referenced by all the services)

| Folder | Contents |
|---|---|
| `Diagnostics/` | The debug log: `AddDebugLog()`, the `DebugLog:Enabled` switch, the in-memory store behind `/logs`, daily log files, and `DebugLogOptions`. Each service's own logs are the categories starting with its application name (`Insights.Analytics`, `Insights.AiHub`). |
| `AiHub/` | `AiHubConnection` (one call to AI Hub, logged; `AddAiHubConnection()`), `AiHubException`, `AiHubOptions`: what Analytics' and DB Catalog's `AiHubClient` build on |
| `Terms.cs`, `QuestionRules.cs`, `ServiceHost.cs` | Word matching for the knowledge model and the catalog, the rules a question must meet, and running as a Windows service |

**Not checked in** (see [.gitignore](../.gitignore)): `temp/`, build output (`bin/`, `obj/`), the log files (`logs/`) and the ratings, workspace files and model cost total (`App_Data/`).

## Local-only files (`temp/`)

`temp/` holds the source data and the scripts that load it into PostgreSQL and copy it to SQL Server. It's in [.gitignore](../.gitignore), so it's never checked in, and **nothing in the app reads it**: the services only talk to the `pos_basket` database and Neo4j. Deleting `temp/` doesn't affect the app.

| Path | Contents |
|---|---|
| `temp/data/pos_basket_august2.csv` | The POS basket export (about 300 MB), or `pos_basket_august2.csv.gz` zipped (72 MB), which `load.ps1` unzips itself |
| `temp/data/POSBasket_KnowledgeModel_Review 1.xlsx` | The table owner's answers, which the business rules in `business-rules.json` are based on |
| `temp/db/pos_basket/` | `load.ps1` and `01-load.sql`, which create the `pos_basket` database and load the CSV into it (see its README) |
| `temp/db/pos_basket_sqlserver/` | A small .NET tool that creates `pos_basket` in SQL Server and copies the table from PostgreSQL, checking both match (`dotnet run -c Release`; see its README) |

To set up `pos_basket` on a new machine, get these files from the team, put them under `temp/`, and run `temp/db/pos_basket/load.ps1`.

## Troubleshooting

Open the **Debug log** card or the log files first: failed steps show their real cause there.

| Symptom | Cause and fix |
|---|---|
| 503 "PostgreSQL is not reachable", or the **Data** pill is red | PostgreSQL isn't running, or `PosBasket:*` or its password is wrong; the cause is in the message. |
| 503 "SQL Server is not reachable" | `PosBasket:Provider` is `SqlServer` and SQL Server isn't running, or `PosBasket:SqlServer:ConnectionString` is wrong, or the `pos_basket` copy hasn't been made yet. |
| SQL Server answers are slow or time out | Check that the copy has its indexes (the copy tool adds them). On a machine with little free memory, SQL Server waits for memory: close other programs or set a fixed `min server memory`. |
| 503 "Neo4j is not reachable" on `/schema`, `/context` or questions | Neo4j isn't running or `Neo4j:Uri` is wrong; the cause is in the message. Start the `salespoc` instance in Neo4j Desktop. |
| `Database does not exist. Database name: 'knowledge-model'` | Create it once: ``CREATE DATABASE `knowledge-model` IF NOT EXISTS`` on the `system` database (see [Quick start](#quick-start)), or set `Neo4j:Database` to an existing one. |
| `Failed after retried … Make sure that your database is online` | The Neo4j driver's generic message. The real cause follows "Cause:" in the error or the log: often Neo4j isn't running (`No connection could be made…`). |
| `NullReferenceException` in `SupportsMultiDatabase` | The Neo4j URI uses `localhost`. Neo4j Desktop listens only on `127.0.0.1`, so use `neo4j://127.0.0.1:7687`. |
| 500 "Knowledge model error", or the **Knowledge model** card shows a failed load | A file has a problem; the message names each one (for example a rule that applies to a name that isn't a concept or metric). Fix and save the file; it reloads by itself. |
| The AI uses the wrong column or misses a rule | Check **Knowledge model used** under the answer. If the right concept or metric isn't there, add the question's word to its `Synonyms`; if a rule is missing, add the concept or metric to its `AppliesTo`. |
| 400 "Query rejected" | The SQL guard refused the query; the message says why. The AI is told the reason and corrects its query once. |
| 400 "Query took too long" | The database cancelled it after `Query:TimeoutSeconds`. Narrow the question, or add an index for it. |
| 429 "Daily model budget reached" | Today's cost reached `OpenAI:DailyBudgetUsd` (or `Bedrock:DailyBudgetUsd`). Raise it in the AI Hub's `appsettings.json` (no restart needed) or wait until tomorrow. |
| `/ai/*` or `/ask` return 503 "AI Hub unavailable" | AI Hub isn't running, or `AiHub:BaseUrl` is wrong. |
| `/api/ai/ask` returns 503 "Analytics unavailable", "DB Catalog unavailable" or "AI Hub unavailable" | That service isn't running, or its address under `ReverseProxy:Clusters` in the gateway's appsettings.json is wrong. |
| Saved widgets, schedules or reviews are missing after upgrading | The workspace moved from DB Catalog to the gateway. Copy `src/Insights.DbCatalog/App_Data/admin-*.json`, `reviews.json` and `shares/` to `src/Insights.Gateway/App_Data`. |
| 502 "Bedrock refused access" | The Bedrock API key or AWS credentials are wrong or expired, or aren't allowed to call `Bedrock:Model` in `Bedrock:Region`. Check them and the model access in the Bedrock console. |
| 502 "Bedrock credentials not found or not usable" | `Llm:Provider` is `Bedrock` but no credentials were found. Set `Bedrock:ApiKey` with user-secrets for AI Hub, or `AWS_BEARER_TOKEN_BEDROCK`. |
| 503 "Bedrock unreachable" | AI Hub can't connect to Bedrock at all: network, proxy or firewall, or a wrong `Bedrock:Region`. |
| 502 "Bedrock rejected the request" | Usually a wrong `Bedrock:Model`, or a model without JSON schema output. |
| 502 "OpenAI rejected the API key" | The OpenAI key is wrong or revoked. Set a valid one with `dotnet user-secrets set OpenAI:ApiKey <key> --project src/Insights.AiHub` and restart AI Hub. |
| Configuration error: OpenAI API key is not configured | Set `OpenAI:ApiKey` with user-secrets for AI Hub, or `OPENAI_API_KEY`. |

## Scope and limits

- **Always current data:** every answer reads the database as it is at that moment. The dates the AI sees as "the latest day" are read from it every 10 minutes. The SQL Server copy is a snapshot: it has new PostgreSQL data only after the copy tool runs again.
- **Bought together is computed per question:** there's no precomputed pairs table, so the AI pairs items in SQL for each question. With one item named (“bought with SPAM Musubi”) that takes seconds; listing the top pairs across all items is slower. For two years of data, add a nightly pairs table in PostgreSQL and describe it in `knowledge-model.json`.
- **Larger data needs PostgreSQL tuning, not app changes:** for two years of data, partition `pos_basket_line` by business date, add an index on `transaction_end_date` (the date coverage check reads its minimum and maximum), and add summary tables (daily and weekly totals) to the knowledge model so the AI reads those first.
- **Only the knowledge model's tables can be queried,** and only with a single `SELECT`. The data's database is only ever read; Neo4j is only changed by a knowledge model load.
- **Read-only database user:** the guard and the read-only transaction keep questions from changing data, but for anything beyond a local POC also connect Analytics to PostgreSQL with a user that can only `SELECT` from the knowledge model's tables (on SQL Server, a login only in `db_datareader`, which matters more there since it has no read-only transaction), and to Neo4j with a user limited to the `knowledge model` database.
- **No authentication:** both services listen on `localhost` only and have no login. Add authentication before exposing them anywhere else. Swagger UI is only on in Development.
- **`BAG FEE` is sold as an ordinary item** (`line_type` `REGULAR`), so it shows up in item rankings and as a frequent “bought with” partner. Add a business rule to leave it out if it shouldn't count.
- **Not forecasting:** nothing here predicts future sales yet. Forecasts would be computed by a separate service into PostgreSQL tables and described in `knowledge-model.json`, so questions about them work like any other.
