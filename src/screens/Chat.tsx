import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { fmtTime } from '../lib/dates'
import { thumbOf, uploadImage, useMediaUrl } from '../lib/media'
import { Field, Overlay, Sheet, useToast } from '../components/ui'
import type { Message } from '../lib/types'

const MAX_OPTIONS = 6

export default function Chat({ back }: { back: JSX.Element }) {
  const { data, session, memberName } = useStore()
  const toast = useToast()
  const [text, setText] = useState('')
  const [menu, setMenu] = useState(false)
  const [pollOpen, setPollOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [data.messages.length])

  const failed = () => toast(navigator.onLine ? 'Not sent. Try again.' : 'You are offline. Send it again with signal.')

  const send = async () => {
    const body = text.trim()
    if (!body) return
    setText('')
    const { error } = await supabase.from('messages').insert({ trip_id: session!.tripId, member_id: session!.memberId, body })
    if (error) { setText(body); failed() }
  }

  // Whatever is typed in the box goes along as the caption.
  const sendPhoto = async (file: File) => {
    setUploading(true)
    try {
      const image_path = await uploadImage(session!.tripId, 'chat', file)
      const { error } = await supabase.from('messages').insert({
        trip_id: session!.tripId, member_id: session!.memberId, kind: 'image', body: text.trim() || 'Photo', image_path
      })
      if (error) throw error
      setText('')
    } catch { failed() } finally { setUploading(false) }
  }

  return (
    <div className="chatwrap">
      <div style={{ marginBottom: 10 }}>{back}</div>
      <div className="msgs">
        {data.messages.length === 0 && <div className="empty">No messages yet. Say hi!</div>}
        {data.messages.map((m) => {
          const mine = m.member_id === session!.memberId
          const who = !mine && <div className="who">{memberName(m.member_id)}</div>
          if (m.kind === 'bolleke') return (
            <div className="msg sys" key={m.id}>📍 {m.body} · {fmtTime(m.created_at, Intl.DateTimeFormat().resolvedOptions().timeZone)} · <a href="#map" style={{ color: 'var(--gold)' }}>see map</a></div>
          )
          if (m.kind === 'poll') return <div className="msg wide" key={m.id}><div className="who">{mine ? 'Your poll' : `${memberName(m.member_id)} asks`}</div><Poll m={m} /></div>
          if (m.kind === 'image' && m.image_path) return (
            <div className={`msg photo ${mine ? 'mine' : ''}`} key={m.id}>
              {who}<Thumb path={m.image_path} onOpen={() => setViewing(m.image_path)} />
              {m.body !== 'Photo' && <div>{m.body}</div>}
            </div>
          )
          return <div className={`msg ${mine ? 'mine' : ''}`} key={m.id}>{who}{m.body}</div>
        })}
        <div ref={end} />
      </div>
      <div className="composer">
        {menu && (
          <div className="attach">
            <button type="button" className="btn ghost sm" onClick={() => { setMenu(false); picker.current?.click() }}>📷 Photo</button>
            <button type="button" className="btn ghost sm" onClick={() => { setMenu(false); setPollOpen(true) }}>📊 Poll</button>
          </div>
        )}
        <form className="row" onSubmit={(e) => { e.preventDefault(); send() }}>
          <button type="button" className="plus" aria-label="Add a photo or a poll" aria-expanded={menu} disabled={uploading} onClick={() => setMenu(!menu)}>{uploading ? '…' : '+'}</button>
          <input id="chatIn" value={text} onChange={(e) => setText(e.target.value)} placeholder={uploading ? 'Sending photo…' : 'Message the group'} autoComplete="off" />
          <button className="btn sm" type="submit">Send</button>
        </form>
        <input ref={picker} type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) sendPhoto(f)
        }} />
      </div>
      {pollOpen && <PollSheet onClose={() => setPollOpen(false)} />}
      {viewing && <FullPhoto path={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

function Thumb({ path, onOpen }: { path: string; onOpen: () => void }) {
  const url = useMediaUrl(thumbOf(path))
  return (
    <button type="button" className="thumb" onClick={onOpen} aria-label="Open photo">
      {url ? <img src={url} alt="" /> : <span className="muted">Photo</span>}
    </button>
  )
}

function FullPhoto({ path, onClose }: { path: string; onClose: () => void }) {
  const url = useMediaUrl(path)
  return (
    <Overlay>
      <div className="viewer dark">
        <div className="row between" style={{ padding: 12 }}><b>Photo</b><button className="btn sm" onClick={onClose}>Close</button></div>
        {url ? <img src={url} alt="" /> : <div className="empty" style={{ margin: 16 }}>Loading the photo. It needs signal the first time.</div>}
      </div>
    </Overlay>
  )
}

function Poll({ m }: { m: Message }) {
  const { data, session, memberName } = useStore()
  const toast = useToast()
  const votes = data.pollVotes.filter((v) => v.message_id === m.id && v.choice != null)
  const mine = votes.find((v) => v.member_id === session!.memberId)?.choice ?? null

  // Tap your own answer again to take it back.
  const vote = async (i: number) => {
    const { error } = await supabase.from('poll_votes').upsert({
      message_id: m.id, member_id: session!.memberId, trip_id: session!.tripId, choice: mine === i ? null : i
    })
    if (error) toast(navigator.onLine ? 'Vote failed. Try again.' : 'You are offline. Vote again with signal.')
  }

  return (
    <div className="poll">
      <div className="q">{m.body}</div>
      {(m.poll_options ?? []).map((o, i) => {
        const who = votes.filter((v) => v.choice === i)
        return (
          <button type="button" className="opt" key={i} aria-pressed={mine === i} onClick={() => vote(i)}>
            <span className="bar" style={{ width: `${votes.length ? (who.length / votes.length) * 100 : 0}%` }} />
            <span className="lbl">{o}{who.length > 0 && <small>{who.map((v) => memberName(v.member_id)).join(', ')}</small>}</span>
            <b className="num">{who.length}</b>
          </button>
        )
      })}
      <div className="muted" style={{ fontSize: 11 }}>{votes.length} of {data.members.length} voted</div>
    </div>
  )
}

function PollSheet({ onClose }: { onClose: () => void }) {
  const { session } = useStore()
  const toast = useToast()
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const poll_options = options.map((o) => o.trim()).filter(Boolean)
    if (poll_options.length < 2) return toast('Give at least two answers.')
    setBusy(true)
    const { error } = await supabase.from('messages').insert({
      trip_id: session!.tripId, member_id: session!.memberId, kind: 'poll', body: question.trim(), poll_options
    })
    setBusy(false)
    if (error) return toast(navigator.onLine ? 'Could not post the poll. Try again.' : 'You are offline. Try again with signal.')
    onClose()
  }

  return (
    <Sheet title="Ask the group" onClose={onClose} onSubmit={save} busy={busy} submitLabel="Post poll">
      <Field label="Question" id="pQ"><input id="pQ" required maxLength={200} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Hotpot or dumplings tonight?" /></Field>
      {options.map((o, i) => (
        <Field label={`Answer ${i + 1}`} id={`pO${i}`} key={i}>
          <input id={`pO${i}`} maxLength={80} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
        </Field>
      ))}
      {options.length < MAX_OPTIONS && <button type="button" className="icon-btn" onClick={() => setOptions([...options, ''])}>+ Add an answer</button>}
    </Sheet>
  )
}
