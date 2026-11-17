# DevBoard — Full-Stack Project & Task Tracker

A working full-stack project and task tracker built to demonstrate end-to-end
development with **React**, **TypeScript**, **JavaScript**, **Node.js**,
**MongoDB**, and **GraphQL**.


## Live demo

**https://devboard-iota-seven.vercel.app** — deployed 14 Nov 2026.

Production deployment (zero cost):

- **Frontend**: the Vite/React build in `client/`, served as static files by Vercel.
- **Backend**: the Express + Apollo GraphQL server in `server/`, wrapped as a
  Vercel serverless function (`api/server.ts`) so the same deployment serves
  both the UI and `/graphql` (same-origin; cross-origin mutations are rejected).
- **Database**: MongoDB Atlas M0 free cluster (persistent; data survives
  redeploys and restarts). Connection string lives in a Vercel environment
  variable (`MONGODB_URI`), never in git.
- Writes from the public demo are same-origin only; the demo data is synthetic.

## Skills used

React · TypeScript · JavaScript · Node.js · MongoDB · GraphQL · Apollo Server ·
Apollo Client · Express · Mongoose · Vite · Vitest · Google Gemini API (REST) ·
Rule-based automation

## What it does

- Create, list, update, and delete **projects** (with status: Active / Completed / Archived).
- Create, list, update, and delete **tasks** inside a project (status: To Do / In Progress / Done, priority: Low / Medium / High, optional due date).
- Filter tasks by status; per-project task counts and completed counts are computed live.
- GraphQL API with input validation: empty names/titles, malformed ids, invalid dates, and tasks for missing projects are rejected with typed errors (`BAD_USER_INPUT`, `NOT_FOUND`).
- Deleting a project deletes its tasks (cascade).
- AI automations (see below): rule-based auto-triage with reasons, due-date
  reminders, and project summaries — Gemini-powered when a key is set, local
  otherwise.
- Seed data included (`npm run seed` in `server/`): 2 projects, 6 tasks.

## AI automations (Nov 2026 update)

Build note — added 17 Nov 2026. Everything below is implemented in the code
and covered by tests; nothing here is a mock or a placeholder.

- **Rule-based auto-triage** (`server/src/triage.ts`, pure functions, no API
  key): suggests a priority from urgency keywords (urgent, blocker, crash,
  security, …), deferrable keywords (cleanup, research, someday, …), and the
  due date (overdue → High; due within 48 hours → bumped one level). Every
  suggestion includes the reasons that produced it and a work label (bug /
  feature / docs / chore / task). Exposed as the `triageTask` query and the
  `autoTriageTask` mutation, plus "Suggest priority" and "Auto-triage"
  buttons in the UI. No model is trained and no ML framework is used — the
  rules are plain keyword/date logic, documented in the source file.
- **Due-date reminders** (`server/src/reminders.ts`, pure functions):
  `dueReminders` returns Overdue / Due today / Due soon (≤ 3 days) reminders
  for open tasks, overdue first. Done tasks and tasks without a due date
  never produce a reminder.
- **Project summaries** (`server/src/aiSummary.ts`): `projectSummary` returns
  a short summary, next steps, and task counts. With `GEMINI_API_KEY` set,
  the task list is sent to the Gemini REST API (`generateContent`, default
  model `gemini-2.5-flash`, 8-second timeout, input capped at 30 tasks) and
  the model reply is parsed as JSON. Without a key — or if the call fails,
  times out, or returns unusable output — a deterministic local summary built
  from counts and priorities is returned instead. The `source` field
  (`gemini` / `local`) always says which path produced the summary, and the
  UI labels it the same way. The key is read from the environment only, is
  never logged or returned, and is never committed. The Gemini path is
  tested with a mocked `fetch` (no network, no key); no live Gemini call
  was made during development.

## Architecture

```
devboard/
├── client/   React + TypeScript (Vite) + Apollo Client
│   └── src/  App.tsx, graphql.ts (queries/mutations), components/
│             (ProjectForm, TaskBoard, AutomationPanel)
└── server/   Node.js + TypeScript (Express) + Apollo Server + Mongoose
    ├── src/  index.ts (HTTP + GraphQL entry), schema.ts, resolvers.ts,
    │         models.ts (MongoDB/Mongoose), db.ts, seed.ts,
    │         triage.ts (rule-based auto-triage), reminders.ts
    │         (due-date reminders), aiSummary.ts (Gemini/local summaries)
    └── tests/ graphql.test.ts, automation.test.ts
              (Vitest, in-memory MongoDB)
```

The React frontend talks to the GraphQL API at `/graphql` (proxied to the
Node.js server in development); the API talks to MongoDB through Mongoose.

## Run locally

Prerequisites: Node.js 18+ and a MongoDB instance (local `mongod`, Docker, or
Atlas). No MongoDB is needed to run the tests — they use an in-memory server.

```bash
# 1. Backend (terminal 1)
cd server
npm install
cp .env.example .env        # set MONGODB_URI if not using local MongoDB
npm run seed                # optional: load 2 projects + 6 tasks
npm run dev                 # http://localhost:4000/graphql

# 2. Frontend (terminal 2)
cd client
npm install
npm run dev                 # http://localhost:5173
```

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | Port the API server listens on |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/devboard` | MongoDB connection string |
| `GEMINI_API_KEY` | _(unset)_ | Optional. Gemini API key for AI project summaries. When unset, summaries use the local fallback — the app works fully without it. Never commit a real key. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model used for summaries when a key is set |

No secrets are committed. `.env` files are git-ignored; only `.env.example`
with placeholder values is in the repo.

## Test

```bash
cd server
npm test          # 42 tests (Vitest + mongodb-memory-server)
npm run typecheck # tsc --noEmit, zero errors

cd ../client
npm run build     # tsc + Vite production build
```

## Verified end-to-end (12 Nov 2026)

- Backend: `tsc --noEmit` clean; **11/11 Vitest tests pass** against an
  in-memory MongoDB.
- Frontend: `tsc` clean; `vite build` succeeds (321 modules).
- Live round-trip: server started against MongoDB, seeded 2 projects / 5 tasks,
  then via `curl` against the GraphQL endpoint — created a project, created a
  task, moved it to DONE, read it back, deleted both, and confirmed the list
  was back to the seed data. Client dev server served the app and its
  `/graphql` proxy returned HTTP 200.

## Verified end-to-end — AI automations (17 Nov 2026)

- Backend: `tsc --noEmit` clean; **42/42 Vitest tests pass** (11 original
  GraphQL tests + 31 new automation tests: triage rules, reminders, Gemini
  summary with mocked `fetch`, and the new GraphQL operations) against an
  in-memory MongoDB.
- Frontend: `tsc` clean; `vite build` succeeds (322 modules).
- Live round-trip over HTTP against a local MongoDB: `triageTask` returned
  HIGH with reasons for an urgent task; `projectSummary` returned the local
  summary with correct counts (no key set); `dueReminders` returned the
  overdue task; `autoTriageTask` raised an urgent LOW task to HIGH and the
  change persisted. No live Gemini call was made (no key used); the Gemini
  path is covered by mocked-fetch tests only.

## Author

Ankush Singh — B.Tech., Computer Science, Scaler School of Technology
(2nd year) and BITS Pilani (online). GitHub:
[github.com/ankushsingh21123-blip](https://github.com/ankushsingh21123-blip).

Built as a proof project for the Weekday Software Engineer Intern application.
No client, traction, or revenue claims are made here — this is a personal
learning/build project.
