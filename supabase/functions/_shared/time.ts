// Trip days and times are wall-clock values in the trip's time zone.

/** Wall-clock date ("2027-04-03"), hour and "HH:MM" of an instant in a time zone. */
export function localParts(at: Date, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(at).map((x) => [x.type, x.value])
  )
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), time: `${p.hour}:${p.minute}` }
}

/** The instant at which the clock in `timeZone` shows `date` + `time` ("HH:MM" or "HH:MM:SS"). */
export function zonedToUtc(date: string, time: string, timeZone: string) {
  const guess = Date.parse(`${date}T${time.slice(0, 5)}:00Z`)
  const l = localParts(new Date(guess), timeZone)
  const shown = Date.parse(`${l.date}T${l.time}:00Z`)
  return new Date(guess - (shown - guess))
}

export function diffDays(a: string, b: string) {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86_400_000)
}

export function addDays(d: string, n: number) {
  return new Date(Date.parse(d + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
}
