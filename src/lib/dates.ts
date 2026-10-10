// Trip dates are plain calendar dates ("2027-04-03"); keep them as strings and
// do day arithmetic in UTC so phone time zones never shift a day.
const DAY = 86_400_000
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
export const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * DAY)
export const diffDays = (a: string, b: string) => Math.round((toUtc(a) - toUtc(b)) / DAY)
export const dow = (d: string) => DOW[new Date(toUtc(d)).getUTCDay()]
export const dayNum = (d: string) => +d.slice(8, 10)
export const fmtShort = (d: string) => `${dow(d)} ${dayNum(d)} ${MONTHS[+d.slice(5, 7) - 1]}`

export function localToday() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export function tripDays(start: string, end: string) {
  const out: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')

export function fmtDateTime(iso: string, timeZone = 'Asia/Shanghai') {
  // Shown in the local time of the station or airport, which is what tickets print.
  return new Date(iso).toLocaleString('en-GB', {
    timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}
export function fmtTime(iso: string, timeZone = 'Asia/Shanghai') {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' })
}
