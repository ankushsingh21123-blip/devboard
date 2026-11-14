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
Apollo Client · Express · Mongoose · Vite · Vitest

## What it does

- Create, list, update, and delete **projects** (with status: Active / Completed / Archived).
- Create, list, update, and delete **tasks** inside a project (status: To Do / In Progress / Done, priority: Low / Medium / High, optional due date).
- Filter tasks by status; per-project task counts and completed counts are computed live.
- GraphQL API with input validation: empty names/titles, malformed ids, invalid dates, and tasks for missing projects are rejected with typed errors (`BAD_USER_INPUT`, `NOT_FOUND`).
- Deleting a project deletes its tasks (cascade).
- Seed data included (`npm run seed` in `server/`): 2 projects, 5 tasks.

## Architecture

```
devboard/
├── client/   React + TypeScript (Vite) + Apollo Client
│   └── src/  App.tsx, graphql.ts (queries/mutations), components/
└── server/   Node.js + TypeScript (Express) + Apollo Server + Mongoose
    ├── src/  index.ts (HTTP + GraphQL entry), schema.ts, resolvers.ts,
    │         models.ts (MongoDB/Mongoose), db.ts, seed.ts
    └── tests/ graphql.test.ts (Vitest, in-memory MongoDB)
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
npm run seed                # optional: load 2 projects + 5 tasks
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

No secrets are committed. `.env` files are git-ignored; only `.env.example`
with placeholder values is in the repo.

## Test

```bash
cd server
npm test          # 11 GraphQL tests (Vitest + mongodb-memory-server)
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

## Author

Ankush Singh — Computer Science programme, Scaler School of Technology
(2nd year), and B.Sc. Computer Science, BITS Pilani (online). GitHub:
[github.com/ankushsingh21123-blip](https://github.com/ankushsingh21123-blip).

Built as a proof project for the Weekday Software Engineer Intern application.
No client, traction, or revenue claims are made here — this is a personal
learning/build project.
