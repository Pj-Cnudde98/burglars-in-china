import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { fmtDateTime, fmtShort, fmtTime } from '../lib/dates'
import { enablePush, disablePush, isSubscribed, pushSupport } from '../lib/push'
import { openTicket, uploadTicket } from '../lib/tickets'
import { Field, Overlay, Sheet, initial, useToast } from '../components/ui'
import type { Expense, Stay, Transport } from '../lib/types'
import Chat from './Chat'
import Album from './Album'

export default function Info({ sub, go }: { sub: string | null; go: (h: string) => void }) {
  const { data, syncedAt } = useStore()
  const back = <button className="back" onClick={() => go('info')}>‹ Trip info</button>
  const unread = data.messages.length

  return (
    <main className="screen" id="info-screen">
      {!sub && (
        <div className="stack">
          <h2>Trip info</h2>
          <div className="tiles">
            <button className="tile" onClick={() => go('hotels')}><span className="g">宿</span><b>Hotels</b><span>{data.stays.length} stays · taxi cards</span></button>
            <button className="tile" onClick={() => go('transport')}><span className="g">行</span><b>Transport</b><span>{data.transport.length} flights and trains</span></button>
            <button className="tile" onClick={() => go('money')}><span className="g">钱</span><b>Expenses</b><span>Who owes who</span></button>
            <button className="tile" onClick={() => go('chat')}><span className="g">聊</span><b>Group chat</b><span>{unread} messages</span></button>
            <button className="tile" onClick={() => go('album')}><span className="g">影</span><b>Album</b><span>{data.album.length} photos and videos</span></button>
          </div>
          <button className="card row between" style={{ textAlign: 'left' }} onClick={() => go('settings')}>
            <div><b>Settings</b><div className="muted" style={{ fontSize: 13 }}>Notifications, admin, sign out</div></div><span className="muted">›</span>
          </button>
          <div className="card row"><span className="chip off"><span className="dot" />Saved</span>
            <span className="muted" style={{ fontSize: 13 }}>Hotels, tickets and the full schedule work without internet.{syncedAt ? ` Last synced ${new Date(syncedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : ''}</span>
          </div>
        </div>
      )}
      {sub === 'hotels' && <Hotels back={back} />}
      {sub === 'transport' && <TransportList back={back} />}
      {sub === 'money' && <Money back={back} />}
      {sub === 'chat' && <Chat back={back} />}
      {sub === 'album' && <Album back={back} />}
      {sub === 'settings' && <Settings back={back} />}
    </main>
  )
}

/* ------------------------------------------------------------ hotels */

function Hotels({ back }: { back: JSX.Element }) {
  const { data, session } = useStore()
  const [taxi, setTaxi] = useState<Stay | null>(null)
  const [editing, setEditing] = useState<Partial<Stay> | null>(null)

  if (taxi) return (
    <div className="stack">
      <button className="back" onClick={() => setTaxi(null)}>‹ Hotels</button>
      <span className="eyebrow">Show this to the driver</span>
      <div className="taxi">
        <small>请带我去这个地址 · Please take me to this address</small>
        <div className="zh" style={{ margin: '10px 0' }}>{taxi.address_zh}</div>
        <div style={{ fontWeight: 700 }}>{taxi.name}</div>
        <small>{taxi.address_en}{taxi.phone && <><br />{taxi.phone}</>}</small>
      </div>
    </div>
  )

  return (
    <div className="stack">
      {back}
      <div className="row between"><h2 style={{ margin: 0 }}>Hotels</h2>{session?.isAdmin && <button className="btn sm" onClick={() => setEditing({})}>+ Add</button>}</div>
      {data.stays.length === 0 && <div className="empty">No hotels added yet.</div>}
      {data.stays.map((h) => (
        <div className="ticket" key={h.id}>
          <div className="tk-top">
            <div className="tk-ic zh" style={{ color: 'var(--red)' }}>{h.city_zh?.[0] ?? '宿'}</div>
            <div style={{ minWidth: 0, flex: 1 }}><div className="tk-route">{h.name}</div><div className="zh muted" style={{ fontSize: 13 }}>{h.address_zh}</div></div>
            {session?.isAdmin && <button className="icon-btn" onClick={() => setEditing(h)}>Edit</button>}
          </div>
          <div className="tk-bot"><span>{fmtShort(h.check_in)} → {fmtShort(h.check_out)}</span>{h.booking_ref && <span>Ref <b>{h.booking_ref}</b></span>}</div>
          {h.notes && <div className="tk-bot" style={{ borderTopStyle: 'solid' }}><span>{h.notes}</span></div>}
          <div className="tk-bot" style={{ borderTopStyle: 'solid', alignItems: 'center' }}>
            <span className="num">{h.phone}</span>
            {h.address_zh && <button className="btn sm" onClick={() => setTaxi(h)}>Taxi card</button>}
          </div>
        </div>
      ))}
      {editing && <StaySheet value={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function StaySheet({ value, onClose }: { value: Partial<Stay>; onClose: () => void }) {
  const { session } = useStore()
  const toast = useToast()
  const [v, setV] = useState(value)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Stay) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  const num = (s: unknown) => (s === '' || s == null ? null : Number(s))

  const save = async () => {
    setBusy(true)
    const row = {
      trip_id: session!.tripId, city: v.city, city_zh: v.city_zh || null, name: v.name, address_zh: v.address_zh || null,
      address_en: v.address_en || null, phone: v.phone || null, check_in: v.check_in, check_out: v.check_out,
      booking_ref: v.booking_ref || null, notes: v.notes || null, lat: num(v.lat), lng: num(v.lng)
    }
    const { error } = v.id ? await supabase.from('stays').update(row).eq('id', v.id) : await supabase.from('stays').insert(row)
    setBusy(false)
    if (error) return toast('Could not save. Check the fields and your signal.')
    toast('Saved'); onClose()
  }
  const remove = async () => {
    const { error } = await supabase.from('stays').delete().eq('id', v.id!)
    if (error) return toast('Could not delete.')
    toast('Removed'); onClose()
  }

  return (
    <Sheet title={v.id ? 'Edit hotel' : 'Add hotel'} onClose={onClose} onSubmit={save} busy={busy}
      extra={v.id && <button type="button" className="icon-btn" onClick={remove}>Delete this hotel</button>}>
      <Field label="Hotel name" id="hName"><input id="hName" required value={v.name ?? ''} onChange={set('name')} /></Field>
      <div className="row">
        <Field label="City" id="hCity"><input id="hCity" required value={v.city ?? ''} onChange={set('city')} placeholder="Beijing" /></Field>
        <Field label="City in Chinese" id="hCityZh"><input id="hCityZh" value={v.city_zh ?? ''} onChange={set('city_zh')} placeholder="北京" /></Field>
      </div>
      <div className="row">
        <Field label="Check in" id="hIn"><input id="hIn" type="date" required value={v.check_in ?? ''} onChange={set('check_in')} /></Field>
        <Field label="Check out" id="hOut"><input id="hOut" type="date" required value={v.check_out ?? ''} onChange={set('check_out')} /></Field>
      </div>
      <Field label="Address in Chinese (taxi card)" id="hZh"><textarea id="hZh" value={v.address_zh ?? ''} onChange={set('address_zh')} /></Field>
      <Field label="Address in English" id="hEn"><input id="hEn" value={v.address_en ?? ''} onChange={set('address_en')} /></Field>
      <div className="row">
        <Field label="Phone" id="hPhone"><input id="hPhone" value={v.phone ?? ''} onChange={set('phone')} /></Field>
        <Field label="Booking ref" id="hRef"><input id="hRef" value={v.booking_ref ?? ''} onChange={set('booking_ref')} /></Field>
      </div>
      <div className="row">
        <Field label="Latitude" id="hLat"><input id="hLat" inputMode="decimal" value={v.lat ?? ''} onChange={set('lat')} placeholder="39.93" /></Field>
        <Field label="Longitude" id="hLng"><input id="hLng" inputMode="decimal" value={v.lng ?? ''} onChange={set('lng')} placeholder="116.40" /></Field>
      </div>
      <Field label="Notes" id="hNotes"><textarea id="hNotes" value={v.notes ?? ''} onChange={set('notes')} placeholder="Breakfast, Wi-Fi, check-in time…" /></Field>
    </Sheet>
  )
}

/* ------------------------------------------------------------ transport */

const ICON: Record<Transport['kind'], string> = { flight: '✈', train: '🚄', bus: '🚌', other: '🎫' }

function TransportList({ back }: { back: JSX.Element }) {
  const { data, session } = useStore()
  const toast = useToast()
  const [editing, setEditing] = useState<Partial<Transport> | null>(null)
  const [viewer, setViewer] = useState<{ url: string; pdf: boolean } | null>(null)

  const show = async (path: string) => {
    const url = await openTicket(path)
    if (!url) return toast('Ticket file is not saved on this phone yet. Open it once with signal.')
    setViewer({ url, pdf: path.toLowerCase().endsWith('.pdf') })
  }

  return (
    <div className="stack">
      {back}
      <div className="row between"><h2 style={{ margin: 0 }}>Transport</h2>{session?.isAdmin && <button className="btn sm" onClick={() => setEditing({ kind: 'flight' })}>+ Add</button>}</div>
      {data.transport.length === 0 && <div className="empty">No flights or trains added yet.</div>}
      {data.transport.map((t) => (
        <div className="ticket" key={t.id}>
          <div className="tk-top">
            <div className="tk-ic">{ICON[t.kind]}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="tk-route">{t.from_place} → {t.to_place}</div>
              {(t.from_zh || t.to_zh) && <div className="zh muted" style={{ fontSize: 13 }}>{t.from_zh} → {t.to_zh}</div>}
              <div className="muted num" style={{ fontSize: 12, marginTop: 2 }}>{fmtDateTime(t.depart_at, t.depart_tz)}{t.arrive_at ? ` → ${fmtTime(t.arrive_at, t.arrive_tz)}` : ''}</div>
            </div>
            {session?.isAdmin ? <button className="icon-btn" onClick={() => setEditing(t)}>Edit</button> : <span className="chip off"><span className="dot" />Offline</span>}
          </div>
          <div className="tk-bot">
            <span>{[t.code, t.seat].filter(Boolean).join(' · ')}</span>
            {t.booking_ref && <span>Ref <b>{t.booking_ref}</b></span>}
          </div>
          {(t.file_path || t.notes) && (
            <div className="tk-bot" style={{ borderTopStyle: 'solid' }}>
              <span>{t.notes}</span>
              {t.file_path && <button className="file-link" onClick={() => show(t.file_path!)}>Open ticket</button>}
            </div>
          )}
        </div>
      ))}
      {editing && <TransportSheet value={editing} onClose={() => setEditing(null)} />}
      {viewer && (
        <Overlay><div className="viewer">
          <div className="row between" style={{ padding: 12 }}>
            <b>Ticket</b><button className="btn sm" onClick={() => { URL.revokeObjectURL(viewer.url); setViewer(null) }}>Close</button>
          </div>
          {viewer.pdf ? <iframe src={viewer.url} title="Ticket" /> : <img src={viewer.url} alt="Ticket" />}
        </div></Overlay>
      )}
    </div>
  )
}

// datetime-local works in the phone's zone; tickets are entered in the station's zone.
function toLocalInput(iso: string | null | undefined, tz: string) {
  if (!iso) return ''
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
function fromLocalInput(v: string, tz: string) {
  // Find the UTC instant whose wall-clock time in tz equals v.
  const guess = Date.parse(v + 'Z')
  const asTz = Date.parse(toLocalInput(new Date(guess).toISOString(), tz) + 'Z')
  return new Date(guess - (asTz - guess)).toISOString()
}

function TransportSheet({ value, onClose }: { value: Partial<Transport>; onClose: () => void }) {
  const { session } = useStore()
  const toast = useToast()
  const [v, setV] = useState({ depart_tz: 'Asia/Shanghai', arrive_tz: 'Asia/Shanghai', ...value })
  const [dep, setDep] = useState(toLocalInput(value.depart_at, v.depart_tz))
  const [arr, setArr] = useState(toLocalInput(value.arrive_at, v.arrive_tz))
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Transport) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })

  const save = async () => {
    setBusy(true)
    try {
      const file_path = file ? await uploadTicket(session!.tripId, file) : v.file_path ?? null
      const row = {
        trip_id: session!.tripId, kind: v.kind, from_place: v.from_place, to_place: v.to_place, from_zh: v.from_zh || null, to_zh: v.to_zh || null,
        depart_at: fromLocalInput(dep, v.depart_tz), arrive_at: arr ? fromLocalInput(arr, v.arrive_tz) : null,
        depart_tz: v.depart_tz, arrive_tz: v.arrive_tz, code: v.code || null, booking_ref: v.booking_ref || null,
        seat: v.seat || null, notes: v.notes || null, file_path
      }
      const { error } = v.id ? await supabase.from('transport').update(row).eq('id', v.id) : await supabase.from('transport').insert(row)
      if (error) throw error
      toast('Saved'); onClose()
    } catch { toast('Could not save. Check the fields and your signal.') } finally { setBusy(false) }
  }
  const remove = async () => {
    const { error } = await supabase.from('transport').delete().eq('id', v.id!)
    if (error) return toast('Could not delete.')
    if (v.file_path) await supabase.storage.from('tickets').remove([v.file_path])
    toast('Removed'); onClose()
  }
  const TZ = ['Asia/Shanghai', 'Europe/Brussels', 'Europe/Amsterdam', 'Asia/Dubai', 'Asia/Hong_Kong']

  return (
    <Sheet title={v.id ? 'Edit ticket' : 'Add flight or train'} onClose={onClose} onSubmit={save} busy={busy}
      extra={v.id && <button type="button" className="icon-btn" onClick={remove}>Delete this ticket</button>}>
      <Field label="Type" id="tKind"><select id="tKind" value={v.kind} onChange={set('kind')}><option value="flight">Flight</option><option value="train">Train</option><option value="bus">Bus</option><option value="other">Other</option></select></Field>
      <div className="row">
        <Field label="From" id="tFrom"><input id="tFrom" required value={v.from_place ?? ''} onChange={set('from_place')} /></Field>
        <Field label="To" id="tTo"><input id="tTo" required value={v.to_place ?? ''} onChange={set('to_place')} /></Field>
      </div>
      <div className="row">
        <Field label="From (Chinese)" id="tFromZh"><input id="tFromZh" value={v.from_zh ?? ''} onChange={set('from_zh')} /></Field>
        <Field label="To (Chinese)" id="tToZh"><input id="tToZh" value={v.to_zh ?? ''} onChange={set('to_zh')} /></Field>
      </div>
      <div className="row">
        <Field label="Departs (local time)" id="tDep"><input id="tDep" type="datetime-local" required value={dep} onChange={(e) => setDep(e.target.value)} /></Field>
        <Field label="Zone" id="tDepTz"><select id="tDepTz" value={v.depart_tz} onChange={set('depart_tz')}>{TZ.map((z) => <option key={z}>{z}</option>)}</select></Field>
      </div>
      <div className="row">
        <Field label="Arrives (local time)" id="tArr"><input id="tArr" type="datetime-local" value={arr} onChange={(e) => setArr(e.target.value)} /></Field>
        <Field label="Zone" id="tArrTz"><select id="tArrTz" value={v.arrive_tz} onChange={set('arrive_tz')}>{TZ.map((z) => <option key={z}>{z}</option>)}</select></Field>
      </div>
      <div className="row">
        <Field label="Flight / train no." id="tCode"><input id="tCode" value={v.code ?? ''} onChange={set('code')} placeholder="G87" /></Field>
        <Field label="Booking ref" id="tRef"><input id="tRef" value={v.booking_ref ?? ''} onChange={set('booking_ref')} /></Field>
      </div>
      <Field label="Seat / car" id="tSeat"><input id="tSeat" value={v.seat ?? ''} onChange={set('seat')} /></Field>
      <Field label={v.file_path ? 'Replace ticket file (PDF or photo)' : 'Ticket file (PDF or photo)'} id="tFile"><input id="tFile" type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
      <Field label="Notes" id="tNotes"><textarea id="tNotes" value={v.notes ?? ''} onChange={set('notes')} placeholder="Meet at gate, bring passport…" /></Field>
    </Sheet>
  )
}

/* ------------------------------------------------------------ money */

function Money({ back }: { back: JSX.Element }) {
  const { data, session, memberName } = useStore()
  const [editing, setEditing] = useState<Partial<Expense> | null>(null)
  const bal = new Map<string, number>()
  for (const e of data.expenses) {
    const share = e.amount / e.split_with.length
    bal.set(e.paid_by, (bal.get(e.paid_by) ?? 0) + Number(e.amount))
    for (const m of e.split_with) bal.set(m, (bal.get(m) ?? 0) - share)
  }
  const total = data.expenses.reduce((a, e) => a + Number(e.amount), 0)
  const mine = bal.get(session!.memberId) ?? 0
  const yuan = (n: number) => `¥${Math.round(Math.abs(n)).toLocaleString('en')}`
  const people = [...bal.entries()].filter(([, v]) => Math.abs(v) >= 1).sort((a, b) => b[1] - a[1])

  return (
    <div className="stack">
      {back}
      <div className="row between"><h2 style={{ margin: 0 }}>Expenses</h2><button className="btn sm" onClick={() => setEditing({ paid_by: session!.memberId, split_with: data.members.map((m) => m.id) })}>+ Add</button></div>
      <div className="bal">
        <div className="card"><span className="muted" style={{ fontSize: 12 }}>Group total</span><b>{yuan(total)}</b></div>
        <div className="card"><span className="muted" style={{ fontSize: 12 }}>{mine >= 0 ? 'You get back' : 'You owe'}</span><b className={mine >= 0 ? 'pos' : 'neg'}>{yuan(mine)}</b></div>
      </div>
      {people.length > 0 && (
        <div className="card stack">
          <h3>Balances</h3>
          {people.map(([id, v]) => (
            <div key={id} className="row between"><span>{memberName(id)}</span><b className={`num ${v >= 0 ? 'pos' : 'neg'}`}>{v >= 0 ? '+' : '−'}{yuan(v)}</b></div>
          ))}
        </div>
      )}
      <div className="card">
        {data.expenses.length === 0 && <p className="muted" style={{ margin: 0 }}>No expenses yet.</p>}
        {[...data.expenses].reverse().map((e) => (
          <div className="exp" key={e.id} onClick={() => (e.created_by === session!.memberId || session!.isAdmin) && setEditing(e)}>
            <span className={`av ${e.paid_by === session!.memberId ? 'me' : ''}`}>{initial(memberName(e.paid_by))}</span>
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{e.description}</div>
              <div className="muted" style={{ fontSize: 12 }}>{memberName(e.paid_by)} paid · split {e.split_with.length} ways · {yuan(e.amount / e.split_with.length)} each</div></div>
            <b className="num">{yuan(Number(e.amount))}</b>
          </div>
        ))}
      </div>
      {editing && <ExpenseSheet value={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ExpenseSheet({ value, onClose }: { value: Partial<Expense>; onClose: () => void }) {
  const { data, session } = useStore()
  const toast = useToast()
  const [v, setV] = useState(value)
  const [busy, setBusy] = useState(false)
  const split = new Set(v.split_with ?? [])
  const toggle = (id: string) => { const s = new Set(split); if (s.has(id)) s.delete(id); else s.add(id); setV({ ...v, split_with: [...s] }) }

  const save = async () => {
    if (!split.size) return toast('Pick at least one person to split with.')
    setBusy(true)
    const row = { trip_id: session!.tripId, description: v.description, amount: Number(v.amount), paid_by: v.paid_by, split_with: [...split] }
    const { error } = v.id ? await supabase.from('expenses').update(row).eq('id', v.id) : await supabase.from('expenses').insert({ ...row, created_by: session!.memberId })
    setBusy(false)
    if (error) return toast(navigator.onLine ? 'Could not save. Try again.' : 'You are offline. Try again with signal.')
    toast(v.id ? 'Saved' : 'Expense added'); onClose()
  }
  const remove = async () => {
    const { error } = await supabase.from('expenses').delete().eq('id', v.id!)
    if (error) return toast('Could not delete.')
    toast('Removed'); onClose()
  }

  return (
    <Sheet title={v.id ? 'Edit expense' : 'Add an expense'} onClose={onClose} onSubmit={save} busy={busy}
      extra={v.id && <button type="button" className="icon-btn" onClick={remove}>Delete this expense</button>}>
      <Field label="What" id="eWhat"><input id="eWhat" required value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="e.g. Taxi to the Great Wall" /></Field>
      <div className="row">
        <Field label="Amount (¥)" id="eAmt"><input id="eAmt" type="number" min="0.01" step="0.01" inputMode="decimal" required value={v.amount ?? ''} onChange={(e) => setV({ ...v, amount: e.target.value as unknown as number })} /></Field>
        <Field label="Paid by" id="ePaid"><select id="ePaid" value={v.paid_by} onChange={(e) => setV({ ...v, paid_by: e.target.value })}>{data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
      </div>
      <div className="field">
        <div className="row between"><label>Split between ({split.size})</label>
          <div className="row"><button type="button" className="icon-btn" onClick={() => setV({ ...v, split_with: data.members.map((m) => m.id) })}>All</button><button type="button" className="icon-btn" onClick={() => setV({ ...v, split_with: [] })}>None</button></div>
        </div>
        <div className="filters" style={{ flexWrap: 'wrap' }}>
          {data.members.map((m) => <button type="button" key={m.id} aria-pressed={split.has(m.id)} onClick={() => toggle(m.id)}>{m.name}</button>)}
        </div>
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------ settings */

function Settings({ back }: { back: JSX.Element }) {
  const { session, data, claimAdmin, signOut } = useStore()
  const toast = useToast()
  const [pushOn, setPushOn] = useState(false)
  const [pin, setPin] = useState('')
  const support = pushSupport()
  useEffect(() => { isSubscribed().then(setPushOn).catch(() => {}) }, [])

  return (
    <div className="stack">
      {back}
      <h2>Settings</h2>
      <div className="card stack">
        <div className="toggle">
          <div><b>Notifications</b><div className="muted" style={{ fontSize: 13 }}>Chat, Bolleke, the morning summary and reminders</div></div>
          {support === 'ok' && (
            <button className={`btn sm ${pushOn ? 'ghost' : ''}`} onClick={async () => {
              try {
                if (pushOn) { await disablePush(); setPushOn(false); toast('Notifications off') }
                else { await enablePush(session!); setPushOn(true); toast('Notifications on') }
              } catch (e) { toast((e as Error).message) }
            }}>{pushOn ? 'Turn off' : 'Turn on'}</button>
          )}
        </div>
        {support === 'install' && <p className="muted" style={{ margin: 0, fontSize: 13 }}>On iPhone, first tap Share, then <b>Add to Home Screen</b>, and open the app from there. Then you can turn notifications on.</p>}
        {support === 'unsupported' && <p className="muted" style={{ margin: 0, fontSize: 13 }}>This browser does not support notifications. Try Chrome on Android or Safari on iPhone.</p>}
        {support === 'unconfigured' && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Notifications are not set up on the server yet.</p>}
      </div>

      <div className="card stack">
        <b>Admin</b>
        {session!.isAdmin ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>You are an admin on this phone. You can edit the plan, hotels and tickets.</p> : (
          <form className="row" onSubmit={async (e) => {
            e.preventDefault()
            if (await claimAdmin(pin)) toast('You are now an admin'); else toast('Wrong PIN')
            setPin('')
          }}>
            <input id="adminPin" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" placeholder="Admin PIN" style={{ flex: 1, minWidth: 0, background: 'var(--lacquer-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 10 }} />
            <button className="btn sm" type="submit">Unlock</button>
          </form>
        )}
      </div>

      <div className="card stack">
        <div><b>Signed in as {session!.name}</b><div className="muted" style={{ fontSize: 13 }}>Trip code {data.trip?.code}</div></div>
        <button className="btn ghost sm" onClick={signOut}>Sign out</button>
      </div>
    </div>
  )
}
