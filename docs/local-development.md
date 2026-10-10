# Local development with Docker

You can run the whole backend on your own computer and point the app at it. Nothing you do there reaches the hosted Supabase project, so it is the place to try migrations, new features and risky changes.

The backend is the **Supabase CLI's local stack**: the same Postgres, login, live updates, file storage and edge function services as the hosted project, each in a Docker container. The app itself runs with Vite on your computer, as usual.

```mermaid
flowchart LR
    subgraph Host["Your computer"]
        vite["Vite dev server<br/>localhost:5180<br/>(npm run dev:local)"]
        browser["Browser"]
        subgraph Docker["Docker: Supabase local stack"]
            kong["API gateway<br/>:54321"]
            db[("Postgres :54322<br/>migrations + seeds")]
            auth["Auth"]
            rest["PostgREST"]
            rt["Realtime"]
            st["Storage"]
            fn["Edge functions<br/>notify · tick"]
            studio["Studio :54323"]
        end
    end
    browser --> vite
    browser -- "data, login, files, live updates" --> kong
    kong --> auth & rest & rt & st & fn
    auth & rest & rt & st --> db
    db -- "cron every 5 min · chat webhook" --> kong
    studio --> db
```

## What you need

- [Docker Desktop](https://www.docker.com/products/docker-desktop), running. Give it at least 4 GB of memory.
- The [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`).
- Node, as for the rest of the project.

## Everyday use

```bash
npm run local:up      # start the backend (first time: downloads about 6 GB of images)
npm run dev:local     # start the app, then open http://localhost:5180
```

Join with the trip code from `supabase/seed.sql` (the code and the admin PIN are on the `insert into trips` line). The header shows "local database" so you can tell this copy from the real one.

| Command | What it does |
|---|---|
| `npm run local:up` | Starts the containers, applies new migrations on first start, writes the app's local settings |
| `npm run dev:local` | Runs the app against the local backend with hot reload, on port 5180 |
| `npm run preview:local` | Builds the app and serves it on port 4180, with the service worker. Use this for notifications and offline mode. |
| `npm run local:reset` | Wipes the local database and runs every migration and seed again |
| `npm run local:logs` | Follows the output of the edge functions |
| `npm run local:down` | Stops the containers. The data is kept for next time. |

`npm run dev` is unchanged: it still uses `.env` and talks to the hosted project, on port 5173.

## Useful addresses

| What | Where |
|---|---|
| The app (hot reload) | http://localhost:5180 |
| The app (built, with service worker) | http://localhost:4180 |
| Studio: tables, files, SQL editor, cron jobs | http://127.0.0.1:54323 |
| API | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

## How it is put together

| File | Role |
|---|---|
| [supabase/config.toml](../supabase/config.toml) | The local stack's settings. Changed from the defaults: anonymous sign-in on, both functions callable without a user token, log collection off, the extra seed file. |
| [supabase/migrations/](../supabase/migrations) | Applied in order when the database is created. The same files you run on the hosted project. |
| [supabase/seed.sql](../supabase/seed.sql) | The sample trip. |
| [supabase/seed.local.sql](../supabase/seed.local.sql) | Local only. Does what is set up by hand on the hosted project: the two Vault values for the schedule, and the chat webhook (as a trigger). |
| [scripts/local.sh](../scripts/local.sh) | Behind the `npm run local:*` commands. |
| `supabase/functions/.env` | Made on first start, ignored by git. A local VAPID key pair and the webhook secret for the edge functions. |
| `.env.docker.local` | Written on every start, ignored by git. The local address, key and VAPID public key for the app. Vite reads it because the app runs with `--mode docker`. |

Two details worth knowing:

- `local:up` starts the stack with the CLI's health check turned off and waits for Docker's own health checks instead. On a slower computer the CLI otherwise gives up after a few seconds and stops everything.
- `dev:local` refuses to start when `.env.docker.local` is missing. Without it Vite would fall back to `.env` and you would be editing the real trip.

## Trying each feature

| Feature | How to try it locally |
|---|---|
| Chat, polls, photos | Open the app in two browser windows (one private), join with different names |
| Album | Info → Album → Add. Files land in Studio → Storage → `media` |
| Expenses, converter, settle-up | Info → Expenses. Needs internet for the exchange rate the first time |
| Translate | Info → Translate. Needs internet; voice input shows in Chrome |
| Notifications | `npm run preview:local`, open http://localhost:4180, Info → Settings → Notifications → Turn on, then send a chat message from another window |
| Morning summary, reminders | They follow the trip dates. Change the trip to include today in Studio (`trips.start_date` / `end_date`), add an event starting within 30 minutes, and wait for the next 5-minute run. To see the summary outside 08:00 to 11:00, clear `push_log` and adjust `DAILY_HOUR` in [tick/index.ts](../supabase/functions/tick/index.ts) while testing. `npm run local:logs` shows each run. |

## Working on the database

1. Add a new file in `supabase/migrations/` with the next number.
2. `npm run local:reset` to rebuild the local database with it.
3. Try the app. When it is right, run the same file on the hosted project (SQL editor, or `supabase db push`).

## Limits

- The app is reachable from this computer only. To test on a phone you need the hosted project, because phones require HTTPS for the service worker, location and notifications.
- The local keys are the Supabase CLI's public demo keys. They are fine here and useless anywhere else.
- Translation, exchange rates, weather and map tiles are still fetched from the internet.

## When something is off

| Symptom | What to do |
|---|---|
| "Docker is installed but not running" | Start Docker Desktop, wait for it, run `npm run local:up` again |
| "These did not become ready" | `docker logs <name>` for the container listed; usually too little memory for Docker |
| A port is already in use | Another Supabase project is running: `supabase stop --project-id <name>`, or change the ports in `config.toml` |
| The app shows old or odd data | `npm run local:reset` |
| Start completely fresh | `supabase stop --no-backup`, then `npm run local:up` |
