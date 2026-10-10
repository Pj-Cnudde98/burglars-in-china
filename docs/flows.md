# Key flows

## 1. Joining a trip

No email or password. A phone signs in anonymously, then links itself to a member with the trip code.

```mermaid
sequenceDiagram
    actor U as Friend
    participant App as 📱 App (Login.tsx)
    participant Auth as Supabase Auth
    participant DB as Postgres (RPC)

    U->>App: enters code DRAGON-27 + name "Jan"
    App->>Auth: signInAnonymously() (if no session)
    Auth-->>App: JWT, auth.uid()
    App->>DB: rpc join_trip(code, name)
    DB->>DB: find trip by code<br/>upsert member (trip_id, name)<br/>upsert device (auth.uid → member)
    DB-->>App: member_id
    App->>DB: select trip_id from members, is_admin from devices
    App->>App: save Session to localStorage
    App->>DB: load all tables + subscribe to Realtime
```

Re-joining with the same name on a new phone attaches that phone to the existing member. Switching to a different name on the same phone resets `is_admin` to false.

## 2. Unlocking admin

```mermaid
sequenceDiagram
    actor A as Admin
    participant App as 📱 Info → Settings
    participant DB as Postgres
    A->>App: types admin PIN
    App->>DB: rpc claim_admin(pin)
    DB->>DB: crypt(pin, hash) = hash ?
    alt PIN correct
        DB->>DB: devices.is_admin = true (this phone)
        DB-->>App: true
        App->>App: show edit controls
    else wrong
        DB-->>App: false
    end
```

The PIN is never sent back to the client and is stored only as a bcrypt hash. RLS then lets this device write `stays`, `events` and `transport`.

## 3. Loading and live updates

```mermaid
sequenceDiagram
    participant A as 📱 Phone A
    participant DB as Supabase Postgres
    participant RT as Realtime
    participant B as 📱 Phone B

    Note over A,B: On start both load all 9 tables + the trip row,<br/>and subscribe to channel trip-{trip_id}
    B->>DB: insert into restaurants (...)
    DB->>RT: row change
    RT-->>A: postgres_changes (restaurants)
    A->>DB: select * from restaurants where trip_id = ...
    DB-->>A: fresh rows
    A->>A: update state + save snapshot to localStorage
```

The event only says *which table* changed. The app then refetches that table. Beyond that, a full refresh also runs when the app becomes visible again and when the phone comes back online, which covers any events missed while the websocket was asleep.

## 4. Bolleke: share location and alert everyone

```mermaid
sequenceDiagram
    actor U as Jan
    participant App as 📱 Jan's app (bolleke.ts)
    participant DB as Postgres
    participant WH as DB webhook
    participant EF as Edge Function notify
    participant PS as Push service
    participant O as 📱 Others

    U->>App: taps Bolleke
    App->>App: end = now + 15 min<br/>request screen wake lock
    App->>DB: insert messages (kind = bolleke)
    DB->>WH: INSERT event
    WH->>EF: POST + x-webhook-secret
    EF->>DB: sender name, subscriptions of the trip (not the sender)
    EF->>PS: Web Push, urgency high
    PS-->>O: "📍 Jan pressed Bolleke"
    loop every ≥10 s until end
        App->>DB: upsert locations (lat, lng, expires_at)
        DB-->>O: Realtime: locations changed
        O->>O: pin on map (WGS-84 → GCJ-02)
    end
    Note over App,DB: At 15 min (or Stop): expires_at = now<br/>and the pin disappears
```

Limits worth knowing: the browser only gives GPS while the app is open, so the screen is kept awake while sharing. If the page is backgrounded, updates pause until it is visible again.

## 5. Chat notification

```mermaid
flowchart LR
    A["Send message<br/>insert into messages"] --> B["DB webhook"]
    B --> C["Edge Function<br/>notify"]
    C --> D{"For each subscription<br/>of this trip,<br/>except the sender"}
    D --> E["web-push to endpoint"]
    E -->|"201"| F["📱 sw.ts push event<br/>showNotification"]
    E -->|"404 / 410"| G["delete dead<br/>subscription row"]
    F --> H["tap → open /#chat or /#map"]
```

## 5b. Morning summary

Nothing in the app triggers this one. A schedule inside Postgres calls the `tick` function every 5 minutes, and the function decides whether anything is due.

```mermaid
sequenceDiagram
    participant Cron as pg_cron (every 5 min)
    participant EF as Edge Function tick
    participant DB as Postgres
    participant OM as Open-Meteo
    participant PS as Push service
    participant P as 📱 Everyone

    Cron->>EF: POST + x-webhook-secret (pg_net)
    EF->>DB: trips (with timezone)
    Note over EF: For each trip that is under way:<br/>is it 08:00 to 11:00 trip time?
    EF->>DB: insert push_log (trip, "daily:2027-04-03")
    alt already there
        DB-->>EF: duplicate key, skip
    else first run today
        EF->>DB: today's stay, events, departures
        EF->>OM: forecast for the stay
        EF->>PS: Web Push to all subscriptions
        PS-->>P: "Day 3 of 20 · Xi'an · ☀ 21°/9°"
    end
```

The `push_log` insert is the lock: whichever run inserts the key sends the notification, and later runs see the duplicate and skip. The three-hour window means a missed run at 08:00 is caught by the next one.

## 5c. Reminders

The same 5-minute run also looks ahead for things that are about to start.

```mermaid
flowchart TD
    tick["tick runs (every 5 min)"] --> tq["Transport leaving within 3 h"]
    tick --> eq["Events today or tomorrow<br/>with a start time<br/>(not 'free' or 'stay')"]
    tq --> tl{"Within the lead time?<br/>flight 3 h · train 1 h<br/>bus 45 min · other 1 h"}
    eq --> el{"Starts within 30 min?"}
    tl -- yes --> claim1["claim push_log<br/>transport:id:depart_at"]
    el -- yes --> claim2["claim push_log<br/>event:id:day+time"]
    claim1 -- first time --> p1["✈ CA123 to Xi'an leaves at 09:00<br/>opens #transport"]
    claim2 -- first time --> p2["⏰ 10:00 Forbidden City<br/>opens #plan"]
```

Event times are wall-clock times in `trips.timezone`; transport uses its own `depart_at` instant. The time is part of the `push_log` key, so moving a train to a later hour sends a new reminder. Reminders are checked from one day before the trip starts to one day after it ends, to cover the flights out and back.

## 5d. Photos and polls in chat

Both are ordinary rows in `messages`, so they reach other phones and trigger notifications exactly like text does.

```mermaid
sequenceDiagram
    actor U as Jan
    participant App as 📱 Chat.tsx + media.ts
    participant ST as Storage: media
    participant DB as Postgres
    participant O as 📱 Others

    U->>App: picks a photo
    App->>App: shrink to 1600 px JPEG<br/>+ 480 px preview
    App->>ST: upload trip/chat/x.thumb.jpg, then x.jpg
    App->>DB: insert messages (kind = image, image_path)
    DB-->>O: Realtime + push "📷 Photo"
    O->>ST: download the preview (kept in Cache Storage)
    Note over O: Tap → download the full photo once

    U->>App: posts a poll (question + 2 to 6 answers)
    App->>DB: insert messages (kind = poll, poll_options)
    O->>DB: upsert poll_votes (choice)
    DB-->>App: Realtime: poll_votes changed → bars update
```

Photos are shrunk on the phone before upload, so a 5 MB camera picture costs about 300 KB of roaming data.

## 5e. Album

```mermaid
flowchart TB
    pick["Pick photos and videos<br/>(several at once)"] --> kind{"Photo or video?"}
    kind -- photo --> shrink["Shrink to 2560 px JPEG<br/>+ 480 px preview"]
    kind -- video --> size{"Over 50 MB?"}
    size -- yes --> skip["Skipped, with a message"]
    size -- no --> frame["Grab a frame as preview<br/>(when the phone can)"]
    shrink --> up[("Storage: media<br/>trip/album/…")]
    frame --> up
    up --> row["insert album_items<br/>(path, thumb_path, taken_at)"]
    row --> rt["Realtime → every phone"]
    rt --> grid["Grid by day: previews,<br/>kept in Cache Storage"]
    grid --> open{"Open one"}
    open -- photo --> full["Download once, then cached"]
    open -- video --> signed["Signed link, valid 1 hour,<br/>streamed"]
```

The album does not send notifications: it would be one per photo. "Save" hands the photo to the phone's share sheet (Save to Photos); for a video it opens a download link.

## 5f. Expenses: currencies and settle-up

```mermaid
flowchart LR
    add["Add expense<br/>€20, paid by Jan,<br/>split 4 ways"] --> rate["Rate fixed at save<br/>€1 = ¥7.50"]
    rate --> yuan["Counted as ¥150"]
    yuan --> bal["Balances per member<br/>paid − own share"]
    bal --> settle["Settle up:<br/>biggest debtor pays<br/>biggest creditor, repeat"]
    settle --> list["An pays Jan ¥125<br/>An pays Piet ¥65"]
    list -- "tap Paid" --> row["expenses row<br/>is_settlement = true"]
    row --> bal
```

Balances are always in yuan. The rate is stored with each expense, so yesterday's dinner does not change value when the euro moves. A settle-up payment is stored as an expense "paid by the debtor, for the creditor", which cancels the debt with the same arithmetic as everything else. The converter and the "≈ €" amounts use the latest rate, kept on the phone for offline use.

## 6. Enabling notifications on a phone

```mermaid
sequenceDiagram
    participant App as 📱 push.ts
    participant Br as Browser
    participant SW as Service worker
    participant DB as Postgres
    App->>App: pushSupport(): iOS needs Add to Home Screen
    App->>Br: Notification.requestPermission()
    App->>SW: pushManager.subscribe(VAPID public key)
    SW-->>App: endpoint + p256dh + auth
    App->>DB: upsert push_subscriptions (RLS: own rows only)
```

## 7. Tickets

```mermaid
flowchart TB
    admin["Admin uploads PDF/image"] -->|"storage.upload<br/>tripId/timestamp-name"| bucket[("Storage: tickets<br/>private")]
    admin --> row["transport.file_path = path"]
    row --> rt["Realtime: transport changed"]
    rt --> phone["Every phone refreshes transport"]
    phone --> cache{"in Cache Storage<br/>'bic-tickets'?"}
    cache -- no --> dl["storage.download<br/>(RLS: trip members)"] --> put["cache.put"]
    cache -- yes --> skip["skip"]
    put --> open["Open offline from cache"]
    skip --> open
```

## 8. Weather and map

```mermaid
flowchart LR
    city["Current city<br/>(from stays + today's date)"] --> latlng["lat / lng"]
    latlng --> om["Open-Meteo daily forecast<br/>5 days"]
    om --> sw["SW: StaleWhileRevalidate"] --> ui["Today screen"]
    gps["Phone GPS (WGS-84)"] --> gcj["gcj.ts<br/>to GCJ-02"] --> leaflet["Leaflet"]
    tiles["Amap tiles"] --> swt["SW: CacheFirst<br/>3000 tiles / 60 days"] --> leaflet
```
