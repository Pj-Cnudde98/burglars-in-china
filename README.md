# Burglars in China

The trip app for our 20-day China trip. It's a web app that you add to your home screen, on iPhone and Android, with:

- **Today**: the current city, today's plan, the weather and the route
- **Plan**: a day-by-day timeline plus a calendar of the whole trip
- **Bolleke**: one tap shares your live location with the group for 15 minutes and sends everyone a notification
- **Food**: everyone adds restaurants and votes thumbs up or down, ranked per city
- **Info**: hotels with Chinese taxi cards, flights and trains with ticket files, shared expenses with a currency converter and settle-up, group chat with photos and polls, a shared photo and video album, a translator with voice and an offline phrasebook
- **Offline**: the schedule, hotels and tickets are saved on the phone and work without signal

Built with React + Vite (PWA), Supabase (database, live updates, file storage, push function), Leaflet with Amap tiles, Open-Meteo weather, Frankfurter exchange rates, and MyMemory translation. It uses no Google services, so it works in China.

Design docs with architecture diagrams, data model and flows are in [docs/](docs/README.md).

---

## Setup (one time, about 30 minutes)

### 1. Supabase (database)

1. Create a free account at [supabase.com](https://supabase.com) and a new project. A region close to China works best, such as **Singapore** or **Tokyo**.
2. **Authentication → Sign In / Providers**: turn on **Allow anonymous sign-ins**.
3. **SQL Editor**: paste and run `supabase/migrations/0001_init.sql`, then the other files in that folder in number order. (`0002` needs the two Vault values from step 3b first.)
4. Open `supabase/seed.sql`. Change the trip code (`DRAGON-27`), the admin PIN (`8888`) and the dates, then run it. This adds the sample route, hotels and tickets, which you can edit later in the app.
5. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

### 2. Run it on your computer

```bash
npm install
cp .env.example .env      # paste the URL and anon key from step 1.5
npm run dev
```

Open the address it prints, join with your trip code and name, then go to **Info → Settings** and unlock admin with the PIN.

### 2b. Or run everything locally, in Docker

To try changes without touching the real trip, run the backend on your own computer. You need Docker Desktop and the Supabase CLI.

```bash
npm run local:up      # start the local backend
npm run dev:local     # start the app, then open http://localhost:5180
```

Join with the trip code from `supabase/seed.sql`. See [docs/local-development.md](docs/local-development.md) for the other commands and how to try each feature.

### 3. Push notifications (chat + Bolleke)

1. Generate a key pair: `npx web-push generate-vapid-keys`
2. Put the **public** key in `.env` as `VITE_VAPID_PUBLIC_KEY`.
3. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then:
   ```bash
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com WEBHOOK_SECRET=pick-a-long-random-string
   supabase functions deploy notify --no-verify-jwt
   ```
4. In Supabase, go to **Database → Webhooks → Create a new hook**:
   - Table `messages`, event **Insert**
   - Type **Supabase Edge Functions**, function `notify`
   - Add the HTTP header `x-webhook-secret` with the same `WEBHOOK_SECRET` value

### 3b. Morning summary and reminders

Every trip day at 08:00 China time, everyone gets a notification with the city, the weather and the day's plan. Everyone also gets a reminder 3 hours before a flight, 1 hour before a train, 45 minutes before a bus, and 30 minutes before a planned event that has a start time.

1. Deploy the function: `supabase functions deploy tick --no-verify-jwt`
2. In the **SQL Editor**, store the two values the schedule needs (replace both placeholders):
   ```sql
   select vault.create_secret('https://YOUR-PROJECT.supabase.co', 'project_url');
   select vault.create_secret('the-same-WEBHOOK_SECRET-as-step-3', 'webhook_secret');
   ```
3. Paste and run `supabase/migrations/0002_scheduled_push.sql`. It adds a schedule that calls the function every 5 minutes.

To check that it runs, look at **Integrations → Cron → Jobs** and at the `tick` function's logs.

### 4. Put it online (Cloudflare Pages)

1. Create a free account at [cloudflare.com](https://dash.cloudflare.com), then go to **Workers & Pages → Create → Pages → Connect to Git** and pick this repository.
2. Build command `npm run build`, output folder `dist`.
3. Under **Environment variables**, add the three `VITE_…` values from your `.env`.
4. Deploy. You get a link like `burglars-in-china.pages.dev`. Send that, plus the trip code, to the group.

Every push to `main` redeploys automatically.

---

## For the group: installing on your phone

- **iPhone**: open the link in **Safari**, tap Share, then **Add to Home Screen**. Open the app from the home screen, then go to Info → Settings → Notifications → Turn on.
- **Android**: open the link in **Chrome**, tap **Install app** (or menu → Add to Home screen), then turn on notifications in Info → Settings.
- Open the app once with internet before the trip, so everything is saved for offline use.

## Things to know

- **Bolleke works while the app is open.** Web apps can't read your location in the background, so keep the screen on while sharing. The app tries to keep it awake for you.
- **Use your roaming eSIM's data** in China, not local Wi-Fi. That way Supabase, notifications (Android uses Google's push service) and the weather all work.
- **Album space**: Supabase's free plan stores 1 GB in total and at most 50 MB per file. Photos are shrunk to about 1 MB before upload, so there is room for several hundred. Videos are uploaded as they are, so keep them short.
- **Translating by voice**: the 🎤 button shows where the browser can listen (Chrome on Android). On iPhone, tap the microphone key on the keyboard instead. Playing the Chinese out loud and the phrasebook work everywhere, also offline. Free translations are limited to about 5,000 characters a day per connection.
- **Admins**: anyone who enters the admin PIN on their phone can edit the plan, hotels and tickets. Share the PIN with the other admins only.
- **Map**: Amap tiles use the Chinese GCJ-02 grid. The app converts GPS positions, so pins land in the right spot.

## Project layout

```
src/
  App.tsx            tabs and routing (#today, #plan, #map, #food, #info, #chat…)
  screens/           Login, Today, Plan, MapScreen (Bolleke), Food, Info (hotels, transport, money, settings), Money, Chat, Album, Translate
  lib/store.tsx      loads trip data, saves it on the phone, live updates
  lib/bolleke.ts     15-minute live location sharing
  lib/push.ts        notification subscribe/unsubscribe
  lib/tickets.ts     ticket files, cached for offline
  lib/translate.ts   translation, speaking and listening
  lib/phrases.ts     the offline phrasebook
  lib/money.ts       balances, settle-up, exchange rates
  lib/media.ts       shared photos: shrink, upload, cache
  lib/gcj.ts         GPS → Chinese map grid conversion
  sw.ts              service worker: offline cache + notifications
supabase/
  migrations/0001_init.sql   tables, security rules, join/admin functions
  seed.sql                   sample trip (placeholders)
  seed.local.sql             extra setup for the local Docker stack only
  config.toml                settings of the local Docker stack
scripts/local.sh             starts and stops the local Docker stack
  migrations/0002_…          later additions, run in order
  functions/notify/          sends push notifications for chat and Bolleke
  functions/tick/            timed notifications (morning summary, reminders), run by a schedule
  functions/_shared/         code both functions use
```
