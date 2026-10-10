import { addDays, diffDays, localToday, tripDays } from './dates'
import type { Stay, Trip } from './types'

/** The day to show as "today": the real date during the trip, else the first or last day. */
export function focusDay(trip: Trip) {
  const t = localToday()
  if (t < trip.start_date) return trip.start_date
  if (t > trip.end_date) return trip.end_date
  return t
}

/** Where we sleep on the night of `day`. On the last day, the last stay. */
export function stayFor(day: string, stays: Stay[]) {
  return stays.find((s) => day >= s.check_in && day < s.check_out) ?? stays.find((s) => s.check_out === day) ?? null
}

export function cities(stays: Stay[]) {
  const seen = new Map<string, Stay>()
  for (const s of stays) if (!seen.has(s.city)) seen.set(s.city, s)
  return [...seen.values()]
}

export function tripInfo(trip: Trip) {
  const days = tripDays(trip.start_date, trip.end_date)
  const t = localToday()
  return {
    days,
    total: days.length,
    startsIn: t < trip.start_date ? diffDays(trip.start_date, t) : 0,
    dayIndex: (d: string) => diffDays(d, trip.start_date) + 1,
    lastNight: addDays(trip.end_date, -1)
  }
}

/** Distance along the route in km (great circle between stays). */
export function routeKm(stays: Stay[]) {
  let km = 0
  const pts = cities(stays).filter((s) => s.lat != null && s.lng != null)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const r = Math.PI / 180
    const h = Math.sin(((b.lat! - a.lat!) * r) / 2) ** 2 +
      Math.cos(a.lat! * r) * Math.cos(b.lat! * r) * Math.sin(((b.lng! - a.lng!) * r) / 2) ** 2
    km += 2 * 6371 * Math.asin(Math.sqrt(h))
  }
  return Math.round(km / 100) * 100
}
