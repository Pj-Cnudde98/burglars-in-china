# Burglars in China

The trip app for our 20-day China trip. It's a web app that you add to your home screen, on iPhone and Android, with:

- **Today**: the current city, today's plan, the weather and the route
- **Plan**: a day-by-day timeline plus a calendar of the whole trip
- **Bolleke**: one tap shares your live location with the group for 15 minutes and sends everyone a notification
- **Food**: everyone adds restaurants and votes thumbs up or down, ranked per city
- **Info**: hotels with Chinese taxi cards, flights and trains with ticket files, shared expenses, group chat
- **Offline**: the schedule, hotels and tickets are saved on the phone and work without signal

Built with React + Vite (PWA), Supabase (database, live updates, file storage, push function), Leaflet with Amap tiles, and Open-Meteo weather. It uses no Google services, so it works in China.

---

## Setup (one time, about 30 minutes)

### 1. Supabase (database)

1. Create a free account at [supabase.com](https://supabase.com) and a new project. A region close to China works best, such as **Singapore** or **Tokyo**.
2. **Authentication → Sign In / Providers**: turn on **Allow anonymous sign-ins**.
3. **SQL Editor**: paste and run `supabase/migrations/0001_init.sql`.
4. Open `supabase/seed.sql`. Change the trip code (`DRAGON-27`), the admin PIN (`8888`) and the dates, then run it. This adds the sample route, hotels and tickets, which you can edit later in the app.
5. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

### 2. Run it on your computer

```bash
npm install
cp .env.example .env      # paste the URL and anon key from step 1.5
npm run dev
```

Open the address it prints, join with your trip code and name, then go to **Info → Settings** and unlock admin with the PIN.

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
- **Admins**: anyone who enters the admin PIN on their phone can edit the plan, hotels and tickets. Share the PIN with the other admins only.
- **Map**: Amap tiles use the Chinese GCJ-02 grid. The app converts GPS positions, so pins land in the right spot.

## Project layout

```
src/
  App.tsx            tabs and routing (#today, #plan, #map, #food, #info, #chat…)
  screens/           Login, Today, Plan, MapScreen (Bolleke), Food, Info (hotels, transport, money, chat, settings)
  lib/store.tsx      loads trip data, saves it on the phone, live updates
  lib/bolleke.ts     15-minute live location sharing
  lib/push.ts        notification subscribe/unsubscribe
  lib/tickets.ts     ticket files, cached for offline
  lib/gcj.ts         GPS → Chinese map grid conversion
  sw.ts              service worker: offline cache + notifications
supabase/
  migrations/0001_init.sql   tables, security rules, join/admin functions
  seed.sql                   sample trip (placeholders)
  functions/notify/          sends push notifications
```
