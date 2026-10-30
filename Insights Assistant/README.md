# Insights: POS Basket Analytics POC

Lets people ask questions about point-of-sale (POS) basket data in plain English. **Neo4j holds only the knowledge model**: what each business term means, where it lives in PostgreSQL, how things join, the agreed metric formulas, the business rules and verified examples. **The data itself always comes from PostgreSQL.** For each question, the part of the knowledge model it's about goes to an AI model, which writes one read-only SQL query; the query runs on PostgreSQL, and the AI explains the rows.

| Data | Where | What |
|---|---|---|
| POS baskets (one week today: 2026-08-16 to 2026-08-22) | PostgreSQL `pos_basket`, table `public.pos_basket_line` | One row per scanned line. Read live for every question; never copied. |
| Knowledge model | Neo4j database `knowledge-model` | Tables, columns, concepts (Store, Basket, BasketLine, Item, Offer), relationships, metrics, synonyms, business rules and examples. Loaded from three JSON files. |
| Database catalog for [DB Guide](#db-guide) | Neo4j database `db-guide` | The `SEH_Validation_Retail` SQL Server database's tables, columns, joins, indexes, rules and documentation, from its metadata export. DB Guide answers questions about the database's structure from it. |

**Contents:** [Quick start](#quick-start) · [How it works](#how-it-works) · [Q&A page](#qa-page) · [The knowledge model](#the-knowledge-model) · [DB Guide](#db-guide) · [Endpoints](#endpoints) · [Configuration](#configuration) · [Debug log](#debug-log) · [Project structure](#project-structure) · [Local-only files](#local-only-files-temp) · [Troubleshooting](#troubleshooting) · [Scope and limits](#scope-and-limits)

## Quick start

**Prerequisites:** the [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0), PostgreSQL with the `pos_basket` database loaded (see [Local-only files](#local-only-files-temp)), Neo4j 5 or later, and an OpenAI API key.

1. **Start the databases.** PostgreSQL on `localhost:5432`, and Neo4j. On the team's machines Neo4j runs in **Neo4j Desktop 2** as the local instance `salespoc`: start it with ▶ and wait for **RUNNING**.
2. **Create the `knowledge-model` database** once. In Neo4j Desktop open **Query**, connect to `salespoc`, select the `system` database and run ``CREATE DATABASE `knowledge-model` IF NOT EXISTS`` (the backticks are needed because of the dash). (Neo4j Community has only one database: set `Neo4j:Database` to `neo4j` instead.)
3. **Store the passwords** with user-secrets, which keeps them outside the project folder:
   ```powershell
   dotnet user-secrets set "Neo4j:Password"     "<neo4j password>"    --project src/Insights.Analytics
   dotnet user-secrets set "PosBasket:Password" "<postgres password>" --project src/Insights.Analytics
   dotnet user-secrets set "OpenAI:ApiKey"      "<openai key>"        --project src/Insights.AiHub
   ```
   Environment variables also work: `Neo4j__Password`, `PosBasket__Password`, `OpenAI__ApiKey` or `OPENAI_API_KEY`.
4. **Run both services**, each in its own terminal:
   ```powershell
   dotnet run --project src/Insights.Analytics   # http://localhost:5100
   dotnet run --project src/Insights.AiHub      # http://localhost:5200
   ```
   They can start in either order. Analytics loads the knowledge model into Neo4j at startup (a few seconds).
5. **Open http://localhost:5100/** and ask a question or pick a suggested one. There's nothing to load or sync: new data in PostgreSQL is in the next answer.
6. **Optional: DB Guide**, for questions about a database's tables and joins (see [DB Guide](#db-guide)). It needs only Neo4j and AI Hub:
   ```powershell
   dotnet user-secrets set "Neo4j:Password" "<neo4j password>" --project src/Insights.DbGuide
   dotnet run --project src/Insights.DbGuide   # http://localhost:5300
   ```
7. **Run the gateway**, the one entry point for the SEH Intelligence Platform UI and any other client:
   ```powershell
   dotnet run --project src/Insights.Gateway   # http://localhost:5000
   ```
   It passes `/api/db-guide/*`, `/api/analytics/*` and `/api/ai/*` on to the three services, but only the routes `Gateway:Allow` in its appsettings.json lists; everything else (raw SQL, logs, reloads, AI Hub's model calls) stays internal. `GET /health` checks all three services. Outside Development it also serves the built UI from `Gateway:UiPath` (`SEH Intelligence Platform/dist`), so the whole platform is one address.

8. **Run the workspace**, which keeps each user's schedules and board widgets (in files under `src/Insights.Workspace/App_Data`):
   ```powershell
   dotnet run --project src/Insights.Workspace   # http://localhost:5400
   ```
   Through the gateway at `/api/workspace`: `GET`/`POST /schedules`, `PUT`/`DELETE /schedules/{id}` (`{ name, question, frequency: daily|weekly|monthly|quarterly, time: "HH:mm", startsOn: "yyyy-MM-dd", dayOfWeek, dayOfMonth, enabled, board, answer }`; responses add `nextRunAt`), and `GET /widgets?board=`, `POST /widgets` (`{ board, question, answer, result }`), `DELETE /widgets/{id}`. Schedules are saved and shown but not run yet; widgets keep the answer as it was when added.

   **Sign-in and roles.** Every `/api` call needs a sign-in: `POST /api/auth/sign-in` with `{ "username", "password" }` sets an HttpOnly cookie (8 hours, renewed while in use), `GET /api/auth/me` returns the user with their roles and functionalities, and `POST /api/auth/sign-out` ends it. The users are in `Gateway:Users` (for now one, `Admin`, with a plain-text password in appsettings.json: change it, and move it to user-secrets or an environment variable such as `Gateway__Users__0__Password` before going live). `Gateway:Roles` lists the functionalities (the UI's pages: `db-catalog`, `insights-assistant`, ...) each role can use; each `Gateway:Allow` rule names the functionalities that may call it (`*` for anyone signed in). The gateway answers 401 when not signed in, 404 for a route that isn't listed, and 403 when the user's roles don't include it; the UI shows only the user's pages. Changes to these settings apply without a restart.

Other ways in: **Swagger UI** at http://localhost:5100/swagger and http://localhost:5200/swagger (Development only, which `dotnet run` uses), and [requests.http](requests.http), which has a ready-made request for every endpoint (VS Code **REST Client** extension or Visual Studio).

**Upgrading from the version that copied the data into Neo4j:** that copy is no longer used. The old `posbasket` Neo4j database is left as it was; drop it when you no longer need it (`DROP DATABASE posbasket` on the `system` database).

## How it works

| Project | Port | Talks to | Purpose |
|---|---|---|---|
| [src/Insights.Analytics](src/Insights.Analytics) | 5100 | Neo4j (knowledge model), PostgreSQL `pos_basket` (data), AI Hub | Loads the knowledge model into Neo4j, picks the part of it each question is about, runs read-only SQL on PostgreSQL, and serves the Q&A page. It's the **single entry point** for clients: it forwards AI requests to AI Hub (`/ai/*`) and answers questions end to end (`/ask`). |
| [src/Insights.AiHub](src/Insights.AiHub) | 5200 | OpenAI, Analytics (`/context`, and `/ask` for routed questions), DB Guide (`/ask` for routed questions) | The shared AI service: turns English questions into SQL, query results into English answers, and catalog context into answers about a database's structure (`/guide`). Analytics and DB Guide call it; new AI features for other apps or datasets go here. It also tells which service a question is for (`/intent`) and asks that one (`/ask`), so a client needs only one endpoint. |
| [src/Insights.Workspace](src/Insights.Workspace) | 5400 | Files (`App_Data/<user>.json`) | Each user's saved work: questions scheduled to run again (saved and listed; not run yet) and answers kept as widgets on a capability board. Knows the user from the gateway's `X-User` header. |
| [src/Insights.DbGuide](src/Insights.DbGuide) | 5300 | Neo4j (catalog), AI Hub | Loads a database's metadata export into Neo4j and answers questions about its structure: which table to use, how to join, what a column means. Serves its own page. See [DB Guide](#db-guide). |

In this README they're called **Analytics** and **AI Hub** for short.

```
Client (Q&A page, requests.http, another backend) ──► Analytics only

Startup, or knowledge-model.json / business-rules.json / query-examples.json saved
           ──► Analytics ──► replaces the knowledge model in Neo4j (one transaction)

POST /ask  ──► Analytics ──► AI Hub POST /sql ──► Analytics POST /context ──► Neo4j: the question's part of the knowledge model
                    │                         └─► OpenAI: writes one SELECT
                    ├─► PostgreSQL, read-only transaction ──► rows
                    └─► AI Hub POST /answer ──► OpenAI: plain-English answer
```

- **The graph holds meaning, not data.** Neo4j stores what "net sales", "basket" or "bought together" mean and where they live in PostgreSQL. Answers are always computed from PostgreSQL, so they're never out of date and there's nothing to sync.
- **Focused prompts.** A question's words are matched against the knowledge model's names and synonyms. The AI gets the concepts and metrics it names, the concepts on the shortest relationship path between them (so it sees how they join), their tables and columns, the business rules about them, and up to 5 examples that illustrate the most of them. "Net sales by store" gets Store, Basket, BasketLine and Net sales, not offers or items. A question that names nothing in the knowledge model gets all of it.
- **Clear boundaries.** AI Hub never connects to a database, and Analytics never calls OpenAI.
- **Two ways to ask.** `/ask` does the whole question in one call. The Q&A page instead calls `/ai/sql`, `/query` and `/ai/answer` one at a time, so it can show progress and let you edit and rerun the query.

## Q&A page

http://localhost:5100/ is served by Analytics from [src/Insights.Analytics/wwwroot/index.html](src/Insights.Analytics/wwwroot/index.html). It only calls Analytics.

- **Chat:** type a question and the page shows the plain-English answer, a chart when the rows suit one, and **How this was answered**: the AI's description of the query, **Knowledge model used** (the concepts and metrics the AI was given), the generated SQL (editable, with **Run edited query**), the raw rows and **Download CSV**. Status pills at the top right show the **AI service** (OpenAI model and today's cost against the daily budget, or offline), the **Knowledge model** (Neo4j; green when loaded) and the **Data** (PostgreSQL; green when reachable); hover for details.
- **Charts:** a **line** for a series over time (dates, hours), with a tab per measure and a crosshair tooltip; a **network** for pairs such as items bought together (hover a node to highlight its links); **bars** for a short list of label/number pairs. When several fit, tabs switch between them.
- **Follow-ups:** questions such as “and only on Thursday?” build on the last three questions and their queries, and keep their part of the knowledge model. **New chat** clears the chat and starts fresh.
- **Self-correcting:** if PostgreSQL rejects the AI's query, the page sends the error back to the AI once and runs its corrected query; the answer says “query corrected after a PostgreSQL error”.
- **Rating:** 👍 / 👎 under each answer saves a rating (`POST /feedback`). After 👍, **Save as example** adds the question and its query to `query-examples.json`, so the AI reuses it for similar questions.
- **Explain with AI:** a switch under the question box, on by default and remembered per browser. Off skips the AI's plain-English explanation: the answer is the chart and table (a single value shows as one line), which cuts a question's OpenAI cost by about two thirds. `/ask` takes the same option as `"explain": false`.
- **Cost line:** each answer shows its step times and OpenAI cost, or “reused, no OpenAI cost” when AI Hub answered from its cache.
- **Right column:** the same height as the chat, with five cards, **one open at a time**. **Hide panel** (top right) collapses the column to an icon rail; click an icon to reopen it on that card. The open card and the collapsed state are remembered per browser.

| Card | What it shows |
|---|---|
| Suggested questions | Example questions for this dataset (from `/dataset`); click one to ask it |
| Recent questions | The last 30 questions asked in this browser (kept in `localStorage`); click one to ask it again |
| Knowledge model | What the knowledge model holds (concepts, metrics, rules, examples, tables, columns), how the concepts relate, each concept's meaning, and the **last load** (time and counts, or the error), with **Reload knowledge model** |
| Data boundary | What is sent to OpenAI, what stays local, what is saved on this machine, and what can change data |
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

## DB Guide

[src/Insights.DbGuide](src/Insights.DbGuide) answers questions about a **database's structure**, not its data: "Which table should I use for product data?", "How do I join order items to products?", "Which columns are sensitive?". It works the same way as the knowledge model, with a different source: the graph is built from the database's **metadata export** (catalog), and answers come from the graph alone. The database itself is never connected to. When a query helps, the answer includes an example query for you to run.

```
Startup, or a file in catalog/ or db-guide.json changed ──► DB Guide ──► replaces the catalog in Neo4j db-guide (one transaction)

POST /ask ──► DB Guide ──► Neo4j: the tables the question is about, and the joins between them
                  └─► AI Hub POST /guide (question + that catalog context) ──► OpenAI: answer + example query
```

**Open http://localhost:5300/.** The page has the chat (answer, the tables it uses, the example query with **Copy**, and **How this was answered**), and cards for suggested questions, the **Catalog** (every table by business area, with its columns, joins, rules, indexes and documentation page, and a filter), the **Join map** (tables coloured by business area; solid lines are foreign keys, dashed lines are links the database doesn't enforce), and recent questions.

| File | Holds |
|---|---|
| `catalog/` | The metadata export, as the export tool writes it: `database.json`, `business-areas.json`, `relationships.json`, `tables/*.json` (columns, keys, indexes, constraints, triggers, business rules) and `documentation/*.md`. To document another database, replace this folder (or point `Catalog:Path` at another export); it reloads by itself. |
| `db-guide.json` | The page's name and suggested questions, and **synonyms**: extra words for a table (`"inventory.Products": ["item", "sku"]`), column (`inventory.Products.UnitPrice`) or business area. Add one when a question uses a word the export doesn't. |

**In Neo4j** (database `db-guide`, created on the first load when it doesn't exist) every node has the label `Catalog`:

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
| `POST /ask` | `{ "question": "...", "history": [{ "question", "answer" }] }` | `{ question, answer, tables, sql, matched, given, joinPaths, usage, cached }`. `answer` is Markdown; `sql` is an example query (not run) or empty; `matched` says which tables the question pointed at and why; `given` lists the tables the AI got. `history` (optional) makes it a follow-up. |
| `POST /context` | `{ "question": "...", "history": [...] }` | The catalog context for the question, as sent to AI Hub |
| `GET /catalog` | – | The database, counts, business areas, every table in brief, and every join with its SQL condition |
| `GET /catalog/tables/{id}` | – | One table in full, with its documentation page. `id` is schema-qualified: `sales.Orders`. **404** if there's no such table. |
| `GET /catalog/status` / `POST /catalog/reload` | – | The last load `{ at, succeeded, error, counts }` / load again. **500** "Catalog error" names every problem with the export or `db-guide.json`. |
| `GET /health` | – | `{ catalog: { ok, detail }, ai: { ok, detail }, model }` |
| `GET /guide` | – | The page's name and suggested questions |
| `GET /ai/usage` | – | AI Hub's OpenAI cost totals, passed through |

**What goes to OpenAI:** the question and the catalog context (table and column names, types, descriptions, joins, indexes, constraints, triggers and business rules). No data rows. The documentation pages (which include the export's masked sample and profile summaries) are stored in Neo4j and shown on the page, but never sent to OpenAI; column descriptions can still mention a typical value, such as a status's possible values. Each question costs about one US cent with `gpt-5` at low reasoning effort; a repeated question is answered from AI Hub's cache.

## Endpoints

### Insights.Analytics (http://localhost:5100)

| Endpoint | Body | Returns |
|---|---|---|
| `GET /schema` | – | The whole knowledge model from Neo4j: `dialect`, `coverage` (`{ from, to }`: the first and last business date in PostgreSQL, or null), `tables` with `columns`, `concepts` with `attributes`, `relationships`, `metrics`, `rules` and `examples` |
| `POST /context` | `{ "question": "...", "history": ["earlier question", ...] }` | The same shape, narrowed to the question: what AI Hub puts in its prompt. `matched` lists the concepts and metrics its words named; it's empty when nothing matched and the whole knowledge model is returned. |
| `GET /knowledge-model/status` | – | The last load: `{ at, succeeded, error, counts }`. **404** before the first load. |
| `POST /knowledge-model/reload` | – | Loads the three files into Neo4j again and returns the status. Saving a file does this by itself. **500** "Knowledge model error" with every problem when a file is invalid. |
| `GET /health` | – | `{ knowledge model: { ok, detail }, data: { ok, detail }, coverage }`: whether Neo4j holds a loaded knowledge model and PostgreSQL answers |
| `GET /dataset` | – | Dataset name and suggested questions |
| `POST /query` | `{ "sql": "..." }` | `{ columns, rows, truncated }`. Rows are capped at `Query:MaxRows` (default 1000). |
| `POST /ask` | `{ "question": "...", "history": [{ "question", "sql" }] }` | `{ question, answerable, sql, explanation, result, answer, costUsd, corrected, knowledge model }`: the whole flow in one call. `history` (optional, oldest first) makes it a follow-up. If PostgreSQL rejects the generated query, the AI corrects it once (`corrected: true`); if that fails too, the 400 response includes the query as `sql`. |
| `POST /feedback` / `GET /feedback` | `{ "question", "sql", "answer", "rating": "up" \| "down", "comment" }` | Saves a rating to `App_Data/feedback.jsonl` / lists the newest (`?count=`, default 100) |
| `GET /examples` / `POST /examples` / `DELETE /examples?question=` | `{ "question", "sql" }` | Lists, adds (or replaces, by question) or removes a verified example in `query-examples.json`. A query the SQL guard refuses can't be saved. |
| `POST /ai/sql` | as AI Hub `/sql` | Forwarded to AI Hub `/sql` |
| `POST /ai/answer` | as AI Hub `/answer` | Forwarded to AI Hub `/answer` |
| `GET /ai/health` | – | Forwarded to AI Hub `/health`: `{ status, model }` |
| `GET /ai/usage` | – | Forwarded to AI Hub `/usage`: OpenAI calls, tokens and estimated cost so far (see [OpenAI cost](#openai-cost)) |
| `GET /logs?after=<id>` / `DELETE /logs` | – | Recent log entries from Analytics `{ enabled, lastId, entries, logFile }` / clears them |
| `GET /ai/logs?after=<id>` / `DELETE /ai/logs` | – | The same for AI Hub, forwarded |

**`/query` is read-only, in two layers:**
1. **The SQL guard** ([SqlGuard.cs](src/Insights.Analytics/Services/Query/SqlGuard.cs)) refuses, before anything reaches PostgreSQL: more than one statement; anything but `SELECT` or `WITH … SELECT`; words that change data, schema, settings or transactions or lock rows (`INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`, `COPY`, `SET`, `SELECT … INTO`, `FOR UPDATE`, `EXPLAIN` and more, also inside a CTE); system catalogs and `pg_*` functions (`pg_read_file`, `pg_sleep`, …); functions that reach files or other servers, change settings or run SQL from a string (`lo_*`, `dblink`, `query_to_xml`, `set_config`, `nextval`, …); and any table after `FROM` or `JOIN` that isn't in the knowledge model (CTE names and functions such as `generate_series` are fine). It reads the SQL after removing comments and string literals (including `E'…'` and `$$…$$` strings), so they can't hide anything, and a word such as `'DELETE'` inside a value isn't a false alarm.
2. **PostgreSQL itself:** the query runs in a `READ ONLY` transaction with `statement_timeout` = `Query:TimeoutSeconds`, and is always rolled back.

Rejected queries return **400** "Query rejected"; queries PostgreSQL refuses return **400** with its error and hint (a query cancelled by the time limit says so), so the caller can show it or ask the AI again. **503** "PostgreSQL is not reachable" or "Neo4j is not reachable" names the database and the cause. AI Hub errors pass through with AI Hub's own status and message; if AI Hub can't be reached, `/ai/*` and `/ask` return **503**, and **504** if it takes longer than `AiHub:TimeoutSeconds`.

### Insights.AiHub (http://localhost:5200)

| Endpoint | Body | Returns |
|---|---|---|
| `POST /sql` | `{ "question": "...", "history": [...], "failedSql": "...", "error": "..." }` | `{ answerable, sql, explanation, usage, cached, knowledge model }`. It first gets the question's knowledge model context from Analytics `POST /context`. If `answerable` is false, `sql` is empty and `explanation` says why. `history` (optional) makes it a follow-up; `failedSql` and `error` (optional) ask for a corrected query. `knowledge model` names the concepts and metrics the model was given. |
| `POST /answer` | `{ "question": "...", "sql": "...", "results": <Analytics /query response> }` | `{ answer, usage, cached }`, the answer in plain English |
| `POST /guide` | `{ "question": "...", "context": <DB Guide /context response>, "history": [...] }` | `{ answer, tables, sql, usage, cached }`: an answer about a database's structure from the catalog context the caller sends. Used by DB Guide; AI Hub never reads the catalog itself. |
| `POST /intent` | `{ "question": "...", "history": [{ "question", "intent" }] }` | `{ intent, reason, board, usage, cached }`: whether the question is about the sales data (`analytics`), about the database's structure (`db-guide`), or neither (`unclear`), and the capability board an answer about the data belongs on (`basket-intelligence`, `fresh-food-forecasting`, `revenue-opportunities` or `none`). One small model call, given each service's own suggested questions (Analytics `GET /dataset`, DB Guide `GET /guide`) as examples. |
| `POST /ask` | `{ "question": "...", "history": [{ "question", "intent", "answer", "sql" }] }` | `{ question, intent, reason, board, service, result, message, intentUsage, intentCached }`: classifies the question, then asks Analytics or DB Guide (`POST /ask`, at `Analytics:BaseUrl` and `Routing:DbGuideBaseUrl`) and passes its response through in `result`. Each service is sent only its own earlier turns as history (`sql` for Analytics, `answer` for DB Guide). An `unclear` question calls neither: `message` says what to ask instead. A failing service's error is passed on, with the intent in the `X-Intent` header. The one endpoint the UI's Insights Assistant needs (`/api/ai/ask` through the gateway). |
| `POST /follow-ups` | `{ "question": "...", "intent": "analytics", "answer": "...", "columns": [...] }` | `{ questions, usage, cached }`: up to three questions to ask next, about the sales data or the database. The UI asks for these after showing the answer, so they never delay it. |
| `GET /usage` | – | OpenAI calls, tokens and estimated cost, in total and today, and the daily budget |
| `GET /health` | – | `{ status, model }`. Doesn't call OpenAI. |
| `GET /logs?after=<id>` / `DELETE /logs` | – | AI Hub's recent log entries / clears them |

AI Hub returns **500** for missing configuration (such as no API key), **502** for OpenAI errors and **503** when it can't load the knowledge model context from Analytics.

**What goes to OpenAI:** for `/sql`, the question and its knowledge model context (table and column descriptions, concept attributes, metric formulas, the matching business rules and examples, and the first and last date in the data); for `/answer`, the question, the SQL and the query rows (up to `Answer:MaxResultChars`). The POS data has no customer details.

## Configuration

Settings are in each project's `appsettings.json`; `appsettings.Development.json` overrides them when developing (`dotnet run` uses the Development environment). Keep passwords and keys in user-secrets or environment variables (see [Quick start](#quick-start)), never in that file.

| Setting | Used by | Default | Notes |
|---|---|---|---|
| `Neo4j:Uri` / `User` / `Database` | Analytics | `neo4j://127.0.0.1:7687` / `neo4j` / `knowledge-model` | Where the knowledge model is loaded. A load replaces only nodes labelled `KnowledgeModel`. Use `127.0.0.1`, not `localhost` (see [Troubleshooting](#troubleshooting)). |
| `PosBasket:Host` / `Port` / `Database` / `User` | Analytics | `localhost` / `5432` / `pos_basket` / `postgres` | The PostgreSQL database every answer is read from. Password: `PosBasket:Password`. For anything beyond a local POC, use a user that can only `SELECT` from the knowledge model's tables. |
| `Query:MaxRows` / `TimeoutSeconds` | Analytics | `1000` / `30` | Limits for `/query`; the timeout is PostgreSQL's `statement_timeout` |
| `AiHub:BaseUrl` / `TimeoutSeconds` | Analytics | `http://localhost:5200` / `180` | Where `/ai/*` and `/ask` go, and how long to wait for each call |
| `OpenAI:Model` | AI Hub | *(empty)* | The model to use. When empty, `FallbackModel` is used. |
| `OpenAI:FallbackModel` | AI Hub | `gpt-5` | Also used if `Model` returns "model not found" (404) |
| `OpenAI:TimeoutSeconds` | AI Hub | `150` | How long one model call may take; keep it under `AiHub:TimeoutSeconds` |
| `OpenAI:ReasoningEffort` | AI Hub | `low` | `minimal`, `low`, `medium` or `high`, for reasoning models (gpt-5, o-series) only. Lower is faster and cheaper. Empty uses OpenAI's default (`medium`). |
| `OpenAI:DailyBudgetUsd` | AI Hub | `5` | Questions are refused (429) once today's OpenAI cost reaches this; `0` means no limit |
| `Cache:Enabled` / `MaxEntries` | AI Hub | `true` / `500` | Reuse the query for a repeated question while its knowledge model context is the same, and the answer for the same question, query and results, without calling OpenAI. Follow-ups and corrections are never cached. |
| `OpenAI:Prices` | AI Hub | gpt-5, gpt-5-mini, gpt-5-nano, gpt-4.1, gpt-4o families | US dollars per million input, cached input and output tokens, used to count cost (see [OpenAI cost](#openai-cost)) |
| `Analytics:BaseUrl` | AI Hub | `http://localhost:5100` | Where AI Hub gets each question's knowledge model context |
| `Answer:MaxResultChars` | AI Hub | `50000` | Longer query results are cut before they're sent to OpenAI |
| `DebugLog:*` | Both | | See [Debug log](#debug-log) |
| `Knowledge model:*` (in `knowledge-model.json`) and `Dataset:*` (in `business-rules.json`, `query-examples.json` and `suggested-questions.json`) | Analytics | | See [The knowledge model](#the-knowledge-model) |

## Debug log

Both services log each step of what they do, at Information level:
- **Knowledge model:** each load with its counts, and for each question which concepts and metrics it named and what the AI was given.
- **Queries:** the SQL, rows and time, or why it was rejected.
- **`/ask`:** each step.
- **Data:** whether PostgreSQL answers, and the dates it covers.
- **Calls between the services:** every call from Analytics to AI Hub and back, with status and time.
- **OpenAI:** every call, with model, time, tokens, finish reason and cost.

### OpenAI cost

AI Hub counts the cost of its own OpenAI calls; it doesn't call OpenAI's billing API, which needs an admin key. Each reply carries its token counts (input, cached input, output including reasoning), and AI Hub multiplies them by `OpenAI:Prices`.

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
Neo4j Poc/
├── Insights.sln
├── README.md, requests.http, .gitignore
├── src/
│   ├── Insights.Analytics/  knowledge model (Neo4j), read-only SQL (PostgreSQL), /ask, AI forwarding, Q&A page (wwwroot/)
│   ├── Insights.AiHub/      question + knowledge model context → SQL, rows → answer, catalog context → answer (OpenAI)
│   ├── Insights.DbGuide/    database catalog (Neo4j db-guide) → answers about tables and joins, DB Guide page (wwwroot/)
│   └── Insights.Common/     code the services share: the debug log (Diagnostics/)
└── temp/                local-only data and load scripts, not checked in
```

Both services follow the same layout: thin controllers, logic in `Services/`, one options class per settings section, and all dependency-injection registrations in `Extensions/`.

**src/Insights.Analytics**

| Folder | Contents |
|---|---|
| `Controllers/` | `SchemaController` (`/schema`, `/context`), `KnowledgeModelController` (`/knowledge-model/status`, `/knowledge-model/reload`, `/dataset`), `HealthController` (`/health`), `QueryController` (`/query`), `AskController` (`/ask`), `FeedbackController` (`/feedback`, `/examples`), `AiHubController` (`/ai/*`), `LogsController` (`/logs`) |
| `Services/Knowledge model/` | `KnowledgeModelLoader` (checks the files and writes the knowledge model to Neo4j), `KnowledgeModelReader` (the whole knowledge model, or a question's part of it), `KnowledgeModelWatcher` (loads at startup and when a file changes), `Terms` (word matching) |
| `Services/Query/` | `SqlQueryService` (read-only SQL on PostgreSQL), `SqlGuard` (what may run), `SqlValueConverter` (PostgreSQL values to JSON), `PostgresErrors` |
| `Services/Data/` | `PosBasketDatabase` (the PostgreSQL connection pool), `DataCoverageService` (whether PostgreSQL answers, and the dates it covers) |
| `Services/Dataset/` | `ExampleStore` (`query-examples.json`), `FeedbackStore` (ratings) |
| `Services/Ask/` | `AskService` (question → SQL → rows → answer) |
| `Services/AiHub/` | `AiHubClient` (calls AI Hub and waits for the response) |
| `Filters/` | `AiHubErrorFilter`: AI Hub errors, timeouts and failed `/ask` queries as problem responses. `DatabaseErrorHandler`: "Neo4j is not reachable", "PostgreSQL is not reachable" (503) and "Knowledge model error" (500) with the cause, on any endpoint |
| `Models/`, `Configuration/`, `Extensions/` | Request and response records, options classes, `AddAnalytics()` |
| `wwwroot/` | The Q&A page |
| `knowledge-model.json`, `business-rules.json`, `query-examples.json` | The knowledge model (see [The knowledge model](#the-knowledge-model)) |
| `suggested-questions.json` | Dataset name and suggested questions on the Q&A page |

**src/Insights.AiHub**

| Folder | Contents |
|---|---|
| `Controllers/` | `SqlController` (`/sql`), `AnswerController` (`/answer`), `HealthController` (`/health`), `UsageController` (`/usage`), `LogsController` (`/logs`) |
| `Services/Sql/` | `SqlGenerationService` and `SqlPrompt` (question + knowledge model context → SQL) |
| `Services/Answer/` | `AnswerService` and `AnswerPrompt` (rows → English) |
| `Services/Guide/` | `GuideService` and `GuidePrompt` (question + database catalog context → answer and example query, for DB Guide `/guide`) |
| `Services/Knowledge model/` | `KnowledgeModelClient` (gets each question's context from Analytics `/context`) |
| `Services/Llm/` | `LlmClient` (OpenAI chat with model fallback), `UsageTracker` (cost and daily budget), `ResponseCache` |
| `Filters/` | `UpstreamErrorFilter`: missing configuration, OpenAI and Analytics errors as 500, 502 and 503 |
| `Models/`, `Configuration/`, `Extensions/` | Request and response records, options classes, `AddAiHub()`. No CORS: only Analytics calls AI Hub, server to server. |

**src/Insights.DbGuide**

| Folder | Contents |
|---|---|
| `Controllers/` | `AskController` (`/ask`), `CatalogController` (`/catalog`, `/catalog/tables/{id}`, `/context`, `/catalog/status`, `/catalog/reload`, `/guide`), `HealthController` (`/health`, `/ai/usage`) |
| `Services/Catalog/` | `CatalogFiles` (reads and checks the export folder), `CatalogLoader` (writes the catalog to Neo4j), `CatalogReader` (overview, one table, or a question's part of it), `CatalogWatcher` (loads at startup and when a file changes), `Terms` (word matching, as in Analytics) |
| `Services/Ask/`, `Services/AiHub/` | `AskService` (question → catalog context → AI Hub `/guide`), `AiHubClient` |
| `Filters/` | `ErrorHandler`: "Neo4j is not reachable" (503), "Catalog error" (500) and AI Hub errors as problem responses |
| `Models/`, `Configuration/`, `Extensions/` | The export's file formats (`CatalogExport`), request and response records, options classes, `AddDbGuide()` |
| `wwwroot/` | The DB Guide page |
| `catalog/`, `db-guide.json` | The metadata export and the page's questions and synonyms (see [DB Guide](#db-guide)) |

**src/Insights.Common** (class library, referenced by all three services)

| Folder | Contents |
|---|---|
| `Diagnostics/` | The debug log: `AddDebugLog()`, the `DebugLog:Enabled` switch, the in-memory store behind `/logs`, daily log files, and `DebugLogOptions`. Each service's own logs are the categories starting with its application name (`Insights.Analytics`, `Insights.AiHub`). |

**Not checked in** (see [.gitignore](../.gitignore)): `temp/`, build output (`bin/`, `obj/`), the log files (`logs/`) and the ratings and OpenAI cost total (`App_Data/`).

## Local-only files (`temp/`)

`temp/` holds the source data and the scripts that load it into PostgreSQL. It's in [.gitignore](../.gitignore), so it's never checked in, and **nothing in the app reads it**: the services only talk to the `pos_basket` database and Neo4j. Deleting `temp/` doesn't affect the app.

| Path | Contents |
|---|---|
| `temp/data/pos_basket_august2.csv` | The POS basket export (about 300 MB), or `pos_basket_august2.csv.gz` zipped (72 MB), which `load.ps1` unzips itself |
| `temp/data/POSBasket_KnowledgeModel_Review 1.xlsx` | The table owner's answers, which the business rules in `business-rules.json` are based on |
| `temp/db/pos_basket/` | `load.ps1` and `01-load.sql`, which create the `pos_basket` database and load the CSV into it (see its README) |

To set up `pos_basket` on a new machine, get these files from the team, put them under `temp/`, and run `temp/db/pos_basket/load.ps1`.

## Troubleshooting

Open the **Debug log** card or the log files first: failed steps show their real cause there.

| Symptom | Cause and fix |
|---|---|
| 503 "PostgreSQL is not reachable", or the **Data** pill is red | PostgreSQL isn't running, or `PosBasket:*` or its password is wrong; the cause is in the message. |
| 503 "Neo4j is not reachable" on `/schema`, `/context` or questions | Neo4j isn't running or `Neo4j:Uri` is wrong; the cause is in the message. Start the `salespoc` instance in Neo4j Desktop. |
| `Database does not exist. Database name: 'knowledge-model'` | Create it once: ``CREATE DATABASE `knowledge-model` IF NOT EXISTS`` on the `system` database (see [Quick start](#quick-start)), or set `Neo4j:Database` to an existing one. |
| `Failed after retried … Make sure that your database is online` | The Neo4j driver's generic message. The real cause follows "Cause:" in the error or the log: often Neo4j isn't running (`No connection could be made…`). |
| `NullReferenceException` in `SupportsMultiDatabase` | The Neo4j URI uses `localhost`. Neo4j Desktop listens only on `127.0.0.1`, so use `neo4j://127.0.0.1:7687`. |
| 500 "Knowledge model error", or the **Knowledge model** card shows a failed load | A file has a problem; the message names each one (for example a rule that applies to a name that isn't a concept or metric). Fix and save the file; it reloads by itself. |
| The AI uses the wrong column or misses a rule | Check **Knowledge model used** under the answer. If the right concept or metric isn't there, add the question's word to its `Synonyms`; if a rule is missing, add the concept or metric to its `AppliesTo`. |
| 400 "Query rejected" | The SQL guard refused the query; the message says why. The AI is told the reason and corrects its query once. |
| 400 "Query took too long" | PostgreSQL cancelled it after `Query:TimeoutSeconds`. Narrow the question, or add an index for it in PostgreSQL. |
| 429 "Daily OpenAI budget reached" | Today's OpenAI cost reached `OpenAI:DailyBudgetUsd`. Raise it in the AI Hub's `appsettings.json` (no restart needed) or wait until tomorrow. |
| `/ai/*` or `/ask` return 503 "AI Hub unavailable" | AI Hub isn't running, or `AiHub:BaseUrl` is wrong. |
| `/ai/sql` returns 503 "Analytics service unavailable" | AI Hub can't reach Analytics `/context`: Analytics isn't running, `Analytics:BaseUrl` is wrong, or Neo4j is down (the detail says which). |
| 502 "OpenAI rejected the API key" | The OpenAI key is wrong or revoked. Set a valid one with `dotnet user-secrets set OpenAI:ApiKey <key> --project src/Insights.AiHub` and restart AI Hub. |
| Configuration error: OpenAI API key is not configured | Set `OpenAI:ApiKey` with user-secrets for AI Hub, or `OPENAI_API_KEY`. |

## Scope and limits

- **Always current data:** every answer reads PostgreSQL as it is at that moment; there's no copy to sync. The dates the AI sees as "the latest day" are read from PostgreSQL every 10 minutes.
- **Bought together is computed per question:** there's no precomputed pairs table, so the AI pairs items in SQL for each question. With one item named (“bought with SPAM Musubi”) that takes seconds; listing the top pairs across all items is slower. For two years of data, add a nightly pairs table in PostgreSQL and describe it in `knowledge-model.json`.
- **Larger data needs PostgreSQL tuning, not app changes:** for two years of data, partition `pos_basket_line` by business date, add an index on `transaction_end_date` (the date coverage check reads its minimum and maximum), and add summary tables (daily and weekly totals) to the knowledge model so the AI reads those first.
- **Only the knowledge model's tables can be queried,** and only with a single `SELECT`. PostgreSQL is only ever read; Neo4j is only changed by a knowledge model load.
- **Read-only database user:** the guard and the read-only transaction keep questions from changing data, but for anything beyond a local POC also connect Analytics to PostgreSQL with a user that can only `SELECT` from the knowledge model's tables, and to Neo4j with a user limited to the `knowledge model` database.
- **No authentication:** both services listen on `localhost` only and have no login. Add authentication before exposing them anywhere else. Swagger UI is only on in Development.
- **`BAG FEE` is sold as an ordinary item** (`line_type` `REGULAR`), so it shows up in item rankings and as a frequent “bought with” partner. Add a business rule to leave it out if it shouldn't count.
- **Not forecasting:** nothing here predicts future sales yet. Forecasts would be computed by a separate service into PostgreSQL tables and described in `knowledge-model.json`, so questions about them work like any other.
