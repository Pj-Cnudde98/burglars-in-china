import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { addDays, dayNum, dow, fmtShort, hhmm, MONTHS, toUtc } from '../lib/dates'
import { focusDay, stayFor, tripInfo } from '../lib/trip'
import { Field, Sheet, useToast } from '../components/ui'
import type { EventKind, TripEvent } from '../lib/types'

const KINDS: EventKind[] = ['sight', 'food', 'travel', 'free', 'stay']

export default function Plan() {
  const { data, session } = useStore()
  const trip = data.trip
  const [day, setDay] = useState(() => (trip ? focusDay(trip) : ''))
  const [view, setView] = useState<'day' | 'cal'>('day')
  const [editing, setEditing] = useState<Partial<TripEvent> | null>(null)
  const strip = useRef<HTMLDivElement>(null)

  useEffect(() => {
    strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [day, view])

  if (!trip) return <main className="screen"><div className="empty">Loading your trip…</div></main>
  const info = tripInfo(trip)
  const today = focusDay(trip)
  const stay = stayFor(day, data.stays)
  const events = data.events.filter((e) => e.day === day)

  return (
    <main className="screen">
      <div className="stack">
        <div className="seg" role="group" aria-label="View">
          <button aria-pressed={view === 'day'} onClick={() => setView('day')}>Day</button>
          <button aria-pressed={view === 'cal'} onClick={() => setView('cal')}>Calendar</button>
        </div>

        {view === 'day' ? (
          <div className="stack">
            <div className="days" ref={strip}>
              {info.days.map((d) => (
                <button key={d} aria-pressed={d === day} onClick={() => setDay(d)}>
                  <small>{dow(d)}</small><b>{dayNum(d)}</b><small>{stayFor(d, data.stays)?.city_zh ?? ''}</small>
                </button>
              ))}
            </div>
            <div className="row between">
              <div>
                <div className="eyebrow">Day {info.dayIndex(day)} · {fmtShort(day)}{day === today ? ' · Today' : ''}</div>
                <h2 style={{ margin: '4px 0 0' }}>{stay?.city ?? ''} {stay?.city_zh && <span className="zh muted" style={{ fontSize: 16 }}>{stay.city_zh}</span>}</h2>
              </div>
              {session?.isAdmin && <button className="btn sm" onClick={() => setEditing({ day, kind: 'sight' })}>+ Add</button>}
            </div>
            <div className="timeline">
              {events.length === 0 && <div className="empty">Nothing planned yet{session?.isAdmin ? '. Tap Add to plan something.' : '.'}</div>}
              {events.map((e) => (
                <div className="ev" key={e.id}>
                  <div className="t">{hhmm(e.start_time)}</div><div className="rail" />
                  <div className="body" onClick={() => session?.isAdmin && setEditing(e)} style={{ cursor: session?.isAdmin ? 'pointer' : 'default' }}>
                    <div className="tag">{e.kind}</div>
                    <div style={{ fontWeight: 600 }}>{e.title}</div>
                    {e.place_zh && <div className="zh">{e.place_zh}</div>}
                    {e.notes && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{e.notes}</div>}
                  </div>
                </div>
              ))}
              {stay && day < trip.end_date && (
                <div className="ev stay">
                  <div className="t">Night</div><div className="rail" />
                  <div className="body"><div className="tag">Sleep</div><div style={{ fontWeight: 600 }}>{stay.name}</div>{stay.address_zh && <div className="zh">{stay.address_zh}</div>}</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <Calendar start={trip.start_date} end={trip.end_date} today={today} onPick={(d) => { setDay(d); setView('day') }} />
        )}
      </div>
      {editing && <EventSheet value={editing} onClose={() => setEditing(null)} />}
    </main>
  )
}

function Calendar({ start, end, today, onPick }: { start: string; end: string; today: string; onPick: (d: string) => void }) {
  const { data } = useStore()
  // One grid per month the trip touches.
  const months: string[] = []
  for (let d = start.slice(0, 8) + '01'; d <= end; d = addDays(d, 32).slice(0, 8) + '01') months.push(d)
  const cityIdx = new Map(data.stays.map((s, i) => [s.city, i]))

  return (
    <div className="stack">
      {months.map((m) => {
        const first = (new Date(toUtc(m)).getUTCDay() + 6) % 7
        const len = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate()
        return (
          <div key={m} className="stack">
            <h2 style={{ margin: 0 }}>{MONTHS[+m.slice(5, 7) - 1]} {m.slice(0, 4)}</h2>
            <div className="cal">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div className="hd" key={i}>{d}</div>)}
              {Array.from({ length: first }, (_, i) => <div className="blank" key={'b' + i} />)}
              {Array.from({ length: len }, (_, i) => {
                const d = m.slice(0, 8) + String(i + 1).padStart(2, '0')
                const inTrip = d >= start && d <= end
                const st = inTrip ? stayFor(d, data.stays) : null
                return (
                  <button key={d} disabled={!inTrip} aria-pressed={d === today}
                    className={inTrip ? `trip c${(cityIdx.get(st?.city ?? '') ?? 0) % 3}` : ''} onClick={() => onPick(d)}>
                    {i + 1}<i>{st?.city_zh ?? ''}</i>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      {data.stays.map((s) => (
        <div key={s.id} className="row between card" style={{ padding: '10px 12px' }}>
          <div className="row"><span className="zh" style={{ color: 'var(--red)', fontSize: 18 }}>{s.city_zh}</span><b>{s.city}</b></div>
          <span className="muted num" style={{ fontSize: 13, textAlign: 'right' }}>{dayNum(s.check_in)}–{dayNum(s.check_out)} {MONTHS[+s.check_out.slice(5, 7) - 1]} · {s.name}</span>
        </div>
      ))}
    </div>
  )
}

function EventSheet({ value, onClose }: { value: Partial<TripEvent>; onClose: () => void }) {
  const { session } = useStore()
  const toast = useToast()
  const [v, setV] = useState(value)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof TripEvent) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value || null })

  const save = async () => {
    setBusy(true)
    const row = { trip_id: session!.tripId, day: v.day, start_time: v.start_time || null, title: v.title, place_zh: v.place_zh || null, kind: v.kind ?? 'sight', notes: v.notes || null }
    const { error } = v.id ? await supabase.from('events').update(row).eq('id', v.id) : await supabase.from('events').insert(row)
    setBusy(false)
    if (error) return toast(navigator.onLine ? 'Could not save. Try again.' : 'You are offline. Try again with signal.')
    toast(v.id ? 'Saved' : 'Added to the plan'); onClose()
  }
  const remove = async () => {
    if (!v.id) return
    const { error } = await supabase.from('events').delete().eq('id', v.id)
    if (error) return toast('Could not delete. Try again.')
    toast('Removed'); onClose()
  }

  return (
    <Sheet title={v.id ? 'Edit activity' : 'Add activity'} onClose={onClose} onSubmit={save} busy={busy}
      extra={v.id && <button type="button" className="icon-btn" onClick={remove}>Delete this activity</button>}>
      <Field label="What" id="evTitle"><input id="evTitle" required value={v.title ?? ''} onChange={set('title')} placeholder="e.g. Forbidden City" /></Field>
      <div className="row">
        <Field label="Day" id="evDay"><input id="evDay" type="date" required value={v.day ?? ''} onChange={set('day')} /></Field>
        <Field label="Time" id="evTime"><input id="evTime" type="time" value={hhmm(v.start_time ?? null)} onChange={set('start_time')} /></Field>
      </div>
      <Field label="Chinese name (for taxis)" id="evZh"><input id="evZh" value={v.place_zh ?? ''} onChange={set('place_zh')} placeholder="故宫博物院" /></Field>
      <Field label="Type" id="evKind"><select id="evKind" value={v.kind ?? 'sight'} onChange={set('kind')}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
      <Field label="Notes" id="evNotes"><textarea id="evNotes" value={v.notes ?? ''} onChange={set('notes')} placeholder="Meeting point, tickets, dress code…" /></Field>
    </Sheet>
  )
}
