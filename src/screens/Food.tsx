import { useState } from 'react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { cities, focusDay, stayFor } from '../lib/trip'
import { Field, RANK, Sheet, useToast } from '../components/ui'
import type { Restaurant } from '../lib/types'

export default function Food() {
  const { data, session, memberName } = useStore()
  const toast = useToast()
  const [city, setCity] = useState('All')
  const [editing, setEditing] = useState<Partial<Restaurant> | null>(null)

  const score = (r: Restaurant) => data.votes.filter((v) => v.restaurant_id === r.id).reduce((a, v) => a + v.value, 0)
  const myVote = (r: Restaurant) => data.votes.find((v) => v.restaurant_id === r.id && v.member_id === session?.memberId)?.value ?? 0
  const list = data.restaurants.filter((r) => city === 'All' || r.city === city).sort((a, b) => score(b) - score(a))
  const cityNames = cities(data.stays).map((s) => s.city)
  const defaultCity = city !== 'All' ? city : (data.trip && stayFor(focusDay(data.trip), data.stays)?.city) || cityNames[0] || ''

  const vote = async (r: Restaurant, value: 1 | -1) => {
    const next = myVote(r) === value ? 0 : value
    const { error } = await supabase.from('votes').upsert({ restaurant_id: r.id, member_id: session!.memberId, trip_id: session!.tripId, value: next })
    if (error) toast(navigator.onLine ? 'Vote failed. Try again.' : 'You are offline. Vote again with signal.')
  }

  return (
    <main className="screen">
      <div className="stack">
        <div className="row between"><h2 style={{ margin: 0 }}>Restaurants</h2><button className="btn sm" onClick={() => setEditing({ city: defaultCity })}>+ Add</button></div>
        <div className="filters">
          {['All', ...cityNames].map((c) => <button key={c} aria-pressed={c === city} onClick={() => setCity(c)}>{c === 'All' ? 'All cities' : c}</button>)}
        </div>
        {list.length === 0 && <div className="empty">No restaurants{city !== 'All' ? ` in ${city}` : ''} yet. Add the first one.</div>}
        {list.map((r, i) => {
          const s = score(r), mv = myVote(r), mine = r.added_by === session?.memberId
          return (
            <div className="card rest" key={r.id}>
              <div className="row" style={{ minWidth: 0, alignItems: 'flex-start' }}>
                <span className="rank">{RANK[i] ?? i + 1}</span>
                <div style={{ minWidth: 0 }} onClick={() => (mine || session?.isAdmin) && setEditing(r)}>
                  <div className="name">{r.name} {r.name_zh && <span className="zh muted" style={{ fontWeight: 500, fontSize: 13 }}>{r.name_zh}</span>}</div>
                  <div className="meta">{r.city}{r.dish ? ` · Order: ${r.dish}` : ''}</div>
                  {r.notes && <div className="meta">{r.notes}</div>}
                  <div className="meta">Added by {memberName(r.added_by)}{mine || session?.isAdmin ? ' · tap to edit' : ''}</div>
                </div>
              </div>
              <div className="votes">
                <button className="up" aria-label="Thumbs up" aria-pressed={mv === 1} onClick={() => vote(r, 1)}>👍</button>
                <b className={s >= 0 ? 'pos' : 'neg'}>{s > 0 ? '+' : ''}{s}</b>
                <button className="down" aria-label="Thumbs down" aria-pressed={mv === -1} onClick={() => vote(r, -1)}>👎</button>
              </div>
            </div>
          )
        })}
      </div>
      {editing && <RestaurantSheet value={editing} cityNames={cityNames} onClose={() => setEditing(null)} />}
    </main>
  )
}

function RestaurantSheet({ value, cityNames, onClose }: { value: Partial<Restaurant>; cityNames: string[]; onClose: () => void }) {
  const { session } = useStore()
  const toast = useToast()
  const [v, setV] = useState(value)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Restaurant) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })

  const save = async () => {
    setBusy(true)
    const row = { trip_id: session!.tripId, city: v.city, name: v.name, name_zh: v.name_zh || null, dish: v.dish || null, notes: v.notes || null }
    let error
    if (v.id) ({ error } = await supabase.from('restaurants').update(row).eq('id', v.id))
    else {
      const res = await supabase.from('restaurants').insert({ ...row, added_by: session!.memberId }).select('id').single()
      error = res.error
      // Adding a place counts as your thumbs up.
      if (res.data) await supabase.from('votes').upsert({ restaurant_id: res.data.id, member_id: session!.memberId, trip_id: session!.tripId, value: 1 })
    }
    setBusy(false)
    if (error) return toast(navigator.onLine ? 'Could not save. Try again.' : 'You are offline. Try again with signal.')
    toast(v.id ? 'Saved' : 'Restaurant added'); onClose()
  }
  const remove = async () => {
    const { error } = await supabase.from('restaurants').delete().eq('id', v.id!)
    if (error) return toast('Could not delete. Try again.')
    toast('Removed'); onClose()
  }

  return (
    <Sheet title={v.id ? 'Edit restaurant' : 'Add a restaurant'} onClose={onClose} onSubmit={save} busy={busy} submitLabel={v.id ? 'Save' : 'Add'}
      extra={v.id && <button type="button" className="icon-btn" onClick={remove}>Delete this restaurant</button>}>
      <Field label="Name" id="rName"><input id="rName" required value={v.name ?? ''} onChange={set('name')} placeholder="e.g. Baiyun Dumpling House" /></Field>
      <Field label="Chinese name (optional)" id="rZh"><input id="rZh" value={v.name_zh ?? ''} onChange={set('name_zh')} placeholder="白云饺子馆" /></Field>
      <Field label="City" id="rCity">
        <select id="rCity" value={v.city ?? ''} onChange={set('city')}>{cityNames.map((c) => <option key={c}>{c}</option>)}</select>
      </Field>
      <Field label="Must order" id="rDish"><input id="rDish" value={v.dish ?? ''} onChange={set('dish')} placeholder="e.g. Pork and chive dumplings" /></Field>
      <Field label="Notes" id="rNotes"><textarea id="rNotes" value={v.notes ?? ''} onChange={set('notes')} placeholder="Address, price, opening hours…" /></Field>
    </Sheet>
  )
}
