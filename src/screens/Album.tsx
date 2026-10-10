import { useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { fmtShort } from '../lib/dates'
import { stayFor } from '../lib/trip'
import { MAX_VIDEO_MB, mediaBlob, removeMedia, signedUrl, thumbOf, uploadImage, uploadVideo, useMediaUrl, useSignedUrl } from '../lib/media'
import { Overlay, useToast } from '../components/ui'
import type { AlbumItem } from '../lib/types'

const localDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Album({ back }: { back: JSX.Element }) {
  const { data, session } = useStore()
  const toast = useToast()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)

  const items = data.album
  const days = new Map<string, AlbumItem[]>()
  for (const it of items) {
    const d = localDay(it.taken_at)
    days.set(d, [...(days.get(d) ?? []), it])
  }
  const at = open ? items.findIndex((i) => i.id === open) : -1

  const add = async (files: File[]) => {
    let failed = 0, tooBig = 0
    setProgress({ done: 0, total: files.length })
    for (const [i, file] of files.entries()) {
      try {
        const video = file.type.startsWith('video/')
        if (video && file.size > MAX_VIDEO_MB * 1024 * 1024) { tooBig++; continue }
        let path: string, thumb_path: string | null
        if (video) ({ path, thumb_path } = await uploadVideo(session!.tripId, 'album', file))
        else { path = await uploadImage(session!.tripId, 'album', file, 2560); thumb_path = thumbOf(path) }
        const { error } = await supabase.from('album_items').insert({
          trip_id: session!.tripId, member_id: session!.memberId, kind: video ? 'video' : 'image', path, thumb_path,
          taken_at: new Date(file.lastModified || Date.now()).toISOString()
        })
        if (error) throw error
      } catch { failed++ } finally { setProgress({ done: i + 1, total: files.length }) }
    }
    setProgress(null)
    if (tooBig) toast(`Videos over ${MAX_VIDEO_MB} MB are too big to add.`)
    else if (failed) toast(navigator.onLine ? `${failed} could not be added. Try again.` : 'You are offline. Add them again with signal.')
    else toast(files.length === 1 ? 'Added to the album' : `${files.length} added to the album`)
  }

  return (
    <div className="stack">
      {back}
      <div className="row between">
        <h2 style={{ margin: 0 }}>Album</h2>
        <button className="btn sm" disabled={!!progress} onClick={() => picker.current?.click()}>
          {progress ? `Adding ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : '+ Add'}
        </button>
      </div>
      <input ref={picker} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => {
        const files = [...(e.target.files ?? [])]
        e.target.value = ''
        if (files.length) add(files)
      }} />
      {items.length === 0 && <div className="empty">No photos yet. Add the first ones: everyone in the group can drop photos and videos here.</div>}
      {[...days.entries()].map(([day, list]) => (
        <div className="stack" key={day} style={{ gap: 6 }}>
          <div className="row between"><span className="eyebrow">{fmtShort(day)}</span><span className="muted" style={{ fontSize: 12 }}>{stayFor(day, data.stays)?.city}</span></div>
          <div className="grid3">
            {list.map((it) => <Cell key={it.id} item={it} onOpen={() => setOpen(it.id)} />)}
          </div>
        </div>
      ))}
      {at >= 0 && (
        <Viewer item={items[at]} onClose={() => setOpen(null)}
          onPrev={at > 0 ? () => setOpen(items[at - 1].id) : undefined}
          onNext={at < items.length - 1 ? () => setOpen(items[at + 1].id) : undefined} />
      )}
    </div>
  )
}

function Cell({ item, onOpen }: { item: AlbumItem; onOpen: () => void }) {
  const url = useMediaUrl(item.thumb_path)
  return (
    <button type="button" className="cell" onClick={onOpen} aria-label={item.kind === 'video' ? 'Open video' : 'Open photo'}>
      {url && <img src={url} alt="" loading="lazy" />}
      {item.kind === 'video' && <span className="play">▶</span>}
    </button>
  )
}

function Viewer({ item, onClose, onPrev, onNext }: { item: AlbumItem; onClose: () => void; onPrev?: () => void; onNext?: () => void }) {
  const { session, memberName } = useStore()
  const toast = useToast()
  const video = item.kind === 'video'
  const photo = useMediaUrl(video ? null : item.path)
  const stream = useSignedUrl(video ? item.path : null) // videos play straight from the server
  const mine = item.member_id === session!.memberId
  const fileName = `burglars-${localDay(item.taken_at)}-${item.id.slice(0, 6)}.${item.path.split('.').pop()}`

  // On phones the share sheet has "Save Image" / "Save to Photos"; elsewhere it is a normal download.
  const save = async () => {
    try {
      if (video) { location.assign(await signedUrl(item.path, fileName)); return }
      const blob = await mediaBlob(item.path)
      if (!blob) throw new Error('offline')
      const file = new File([blob], fileName, { type: blob.type })
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return }
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = fileName; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('Could not save it. Try again with signal.')
    }
  }

  const remove = async () => {
    if (!confirm(`Remove this ${video ? 'video' : 'photo'} from the album for everyone?`)) return
    const { error } = await supabase.from('album_items').delete().eq('id', item.id)
    if (error) return toast('Could not remove it.')
    removeMedia([item.path, item.thumb_path])
    toast('Removed'); onClose()
  }

  const editCaption = async () => {
    const caption = prompt('Caption', item.caption ?? '')
    if (caption == null) return
    const { error } = await supabase.from('album_items').update({ caption: caption.trim().slice(0, 200) || null }).eq('id', item.id)
    if (error) toast('Could not save the caption.')
  }

  return (
    <Overlay>
      <div className="viewer dark">
        <div className="row between" style={{ padding: 12 }}>
          <div style={{ minWidth: 0 }}><b>{memberName(item.member_id)}</b><div className="muted" style={{ fontSize: 12 }}>{new Date(item.taken_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>
        {video
          ? (stream ? <video key={item.id} src={stream} controls playsInline autoPlay /> : <div className="empty" style={{ margin: 16 }}>Videos need signal to play.</div>)
          : (photo ? <img src={photo} alt={item.caption ?? ''} /> : <div className="empty" style={{ margin: 16 }}>Loading the photo. It needs signal the first time.</div>)}
        <div className="stack" style={{ padding: 12, gap: 8 }}>
          {item.caption && <div>{item.caption}</div>}
          <div className="row">
            <button className="btn ghost sm" disabled={!onPrev} onClick={onPrev} aria-label="Previous">‹</button>
            <button className="btn ghost sm" disabled={!onNext} onClick={onNext} aria-label="Next">›</button>
            <span style={{ flex: 1 }} />
            {mine && <button className="icon-btn" onClick={editCaption}>{item.caption ? 'Edit caption' : 'Add caption'}</button>}
            {(mine || session!.isAdmin) && <button className="icon-btn" onClick={remove}>Remove</button>}
            <button className="btn sm" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    </Overlay>
  )
}
