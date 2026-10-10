# Architecture

## System overview

```mermaid
flowchart TB
    subgraph Phone["📱 Phone (installed PWA)"]
        UI["React UI<br/>Today · Plan · Map · Food · Info"]
        Store["store.tsx<br/>in-memory state"]
        LS[("localStorage<br/>session + trip snapshot")]
        CS[("Cache Storage<br/>tickets, tiles, weather, app shell")]
        SW["Service worker<br/>sw.ts"]
        UI <--> Store
        Store <--> LS
        SW <--> CS
        UI -. fetch .-> SW
    end

    subgraph CF["☁️ Cloudflare Pages"]
        Static["Static build<br/>dist/ : index.html, JS, CSS, icons"]
    end

    subgraph SB["🟢 Supabase project"]
        Auth["Auth<br/>anonymous sign-in"]
        API["PostgREST API<br/>+ RPC functions"]
        PG[("Postgres<br/>tables + RLS")]
        RT["Realtime<br/>postgres_changes"]
        ST[("Storage<br/>private 'tickets' bucket")]
        WH["Database webhook<br/>on messages INSERT"]
        EF["Edge Function 'notify'<br/>Deno + web-push"]
        API --- PG
        RT --- PG
        PG --> WH --> EF
        EF -- "service role read" --> PG
    end

    subgraph Ext["🌐 External"]
        Amap["Amap tiles<br/>*.is.autonavi.com"]
        Meteo["Open-Meteo<br/>forecast API"]
        Push["Push services<br/>Apple · Google · Mozilla"]
    end

    Static -- "app files" --> SW
    Store -- "REST + RPC + JWT" --> API
    Store <-- "websocket" --> RT
    UI -- "upload / download" --> ST
    UI -- "sign in" --> Auth
    UI --> Amap
    UI --> Meteo
    EF -- "Web Push (VAPID)" --> Push --> SW
```

## Design principles

1. **No custom server.** The browser talks straight to Supabase. Security is enforced in the database with Row Level Security, not in app code. See [security.md](security.md).
2. **Load everything, keep it fresh.** A trip is small (a few hundred rows), so the app loads all tables once, saves a copy on the phone, and refetches a table whenever Realtime says it changed. There is no per-screen data fetching.
3. **Offline first for read.** Schedule, hotels and tickets are readable with no signal. Writes need a connection.
4. **No accounts.** Friends join with a trip code and a display name. A phone is identified by an anonymous Supabase Auth user.
5. **Free tier friendly.** Cloudflare Pages, Supabase free plan, Open-Meteo and Amap tiles cost nothing.

## Runtime parts

| Part | Where it runs | Source |
|---|---|---|
| React app | Phone browser | [src/](../src) |
| Service worker | Phone browser (background) | [src/sw.ts](../src/sw.ts) |
| Database, auth, realtime, storage | Supabase | [supabase/migrations/0001_init.sql](../supabase/migrations/0001_init.sql) |
| Notification sender | Supabase Edge Function (Deno) | [supabase/functions/notify/index.ts](../supabase/functions/notify/index.ts) |
| Static hosting | Cloudflare Pages | `dist/` from `npm run build` |

## Build and deploy pipeline

```mermaid
flowchart LR
    dev["git push to main"] --> cf["Cloudflare Pages<br/>npm run build<br/>(tsc -b && vite build)"]
    cf --> dist["dist/<br/>app + service worker<br/>+ precache manifest"]
    dist --> url["your-app.pages.dev"]
    env["VITE_SUPABASE_URL<br/>VITE_SUPABASE_ANON_KEY<br/>VITE_VAPID_PUBLIC_KEY"] -. "baked in at build" .-> cf

    sql["supabase/migrations<br/>seed.sql"] -- "run manually in SQL editor<br/>or supabase db push" --> sb[("Supabase Postgres")]
    fn["supabase/functions/notify"] -- "supabase functions deploy" --> ef["Edge Function"]
```

The frontend and the backend deploy **independently**. Pushing to `main` only redeploys the frontend. Database and function changes are applied through the Supabase CLI or SQL editor.
