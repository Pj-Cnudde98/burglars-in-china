// Time-based notifications. Called every 5 minutes by pg_cron (see
// migrations/0002_scheduled_push.sql). Each notification is claimed in
// push_log first, so it is sent once even if two runs overlap.
//
//   Daily summary: at 08:00 trip time on every trip day, today's city,
//   weather, plan and departures.

import { authorized, sendToTrip, supabase } from '../_shared/push.ts'
import { addDays, diffDays, localParts, zonedToUtc } from '../_shared/time.ts'

const DAILY_HOUR = 8
const DAILY_WINDOW_HOURS = 3 // still send if the 08:00 runs were missed, but not in the afternoon

type Trip = { id: string; name: string; start_date: string; end_date: string; timezone: string }
type Stay = { city: string; check_in: string; check_out: string; lat: number | null; lng: number | null }

Deno.serve(async (req) => {
  if (!authorized(req)) return new Response('forbidden', { status: 403 })
  const now = new Date()
  const { data: trips, error } = await supabase.from('trips').select('id, name, start_date, end_date, timezone')
  if (error) return new Response(error.message, { status: 500 })

  let sent = 0
  for (const trip of (trips ?? []) as Trip[]) {
    const today = localParts(now, trip.timezone)
    if (today.date < trip.start_date || today.date > trip.end_date) continue
    sent += await dailySummary(trip, today)
  }
  await supabase.from('push_log').delete().lt('sent_at', new Date(now.getTime() - 30 * 86_400_000).toISOString())
  return Response.json({ sent })
})

/** True the first time a key is seen for a trip. */
async function claim(tripId: string, key: string) {
  const { error } = await supabase.from('push_log').insert({ trip_id: tripId, key })
  if (error && error.code !== '23505') console.error('push_log', error.message)
  return !error
}

async function dailySummary(trip: Trip, today: { date: string; hour: number }) {
  if (today.hour < DAILY_HOUR || today.hour >= DAILY_HOUR + DAILY_WINDOW_HOURS) return 0
  if (!(await claim(trip.id, `daily:${today.date}`))) return 0

  const dayStart = zonedToUtc(today.date, '00:00', trip.timezone).toISOString()
  const dayEnd = zonedToUtc(addDays(today.date, 1), '00:00', trip.timezone).toISOString()
  const [stays, events, transport] = await Promise.all([
    supabase.from('stays').select('city, check_in, check_out, lat, lng').eq('trip_id', trip.id).order('check_in'),
    supabase.from('events').select('start_time, title').eq('trip_id', trip.id).eq('day', today.date)
      .order('start_time', { ascending: true, nullsFirst: true }),
    supabase.from('transport').select('kind, to_place, code, depart_at, depart_tz').eq('trip_id', trip.id)
      .gte('depart_at', dayStart).lt('depart_at', dayEnd).order('depart_at')
  ])

  const list = (stays.data ?? []) as Stay[]
  const stay = list.find((s) => today.date >= s.check_in && today.date < s.check_out) ??
    list.find((s) => s.check_out === today.date) ?? null
  const weather = stay?.lat != null && stay.lng != null ? await forecast(stay.lat, stay.lng, trip.timezone) : ''

  const lines = [
    ...(transport.data ?? []).map((t) =>
      `${ICON[t.kind as string] ?? '🎫'} ${localParts(new Date(t.depart_at), t.depart_tz).time} ${[t.code, 'to', t.to_place].filter(Boolean).join(' ')}`),
    ...(events.data ?? []).map((e) => `${e.start_time ? e.start_time.slice(0, 5) : '·'} ${e.title}`)
  ]
  const shown = lines.slice(0, 5)
  if (lines.length > shown.length) shown.push(`+${lines.length - shown.length} more`)

  const day = diffDays(today.date, trip.start_date) + 1
  const total = diffDays(trip.end_date, trip.start_date) + 1
  return sendToTrip(trip.id, {
    title: [`Day ${day} of ${total}`, stay?.city, weather].filter(Boolean).join(' · '),
    body: shown.length ? shown.join('\n') : 'Nothing planned. Free day!',
    url: '/#today',
    tag: 'daily'
  })
}

const ICON: Record<string, string> = { flight: '✈', train: '🚄', bus: '🚌' }

function weatherIcon(code: number) {
  if (code === 0) return '☀'
  if (code <= 2) return '⛅'
  if (code === 3) return '☁'
  if (code <= 48) return '🌫'
  if (code <= 67 || (code >= 80 && code <= 82)) return '🌧'
  if (code <= 77 || code === 85 || code === 86) return '❄'
  return '⛈'
}

/** "☀ 21°/9°", or "" when the forecast is not available. */
async function forecast(lat: number, lng: number, timeZone: string) {
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=${encodeURIComponent(timeZone)}&forecast_days=1`,
      { signal: AbortSignal.timeout(5000) }
    )
    const d = (await r.json()).daily
    return `${weatherIcon(d.weather_code[0])} ${Math.round(d.temperature_2m_max[0])}°/${Math.round(d.temperature_2m_min[0])}°`
  } catch {
    return ''
  }
}
