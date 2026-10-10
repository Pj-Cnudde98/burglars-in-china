import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import { useStore } from '../lib/store'
import { wgsToGcj } from '../lib/gcj'
import { focusDay, stayFor } from '../lib/trip'
import { initial } from '../components/ui'
import type { useBolleke } from '../lib/bolleke'

// Amap (Gaode) tiles: accurate and fast inside China. lang=en gives English labels where Amap has them.
const TILES = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=en&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
const RING = 2 * Math.PI * 72

function ago(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  return s < 60 ? 'just now' : `${Math.round(s / 60)} min ago`
}

export default function MapScreen({ bolleke }: { bolleke: ReturnType<typeof useBolleke> }) {
  const { data, session, memberName } = useStore()
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const fitted = useRef(false)

  const live = useMemo(() => data.locations.filter((l) => Date.parse(l.expires_at) > Date.now()), [data.locations])
  const stay = data.trip ? stayFor(focusDay(data.trip), data.stays) : null

  useEffect(() => {
    if (!el.current || map.current) return
    const center: [number, number] = stay?.lat != null ? wgsToGcj(stay.lat, stay.lng!) : [35, 105]
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(center, stay ? 13 : 4)
    L.tileLayer(TILES, { subdomains: '1234', maxZoom: 18, attribution: '© AutoNavi' }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redraw pins whenever positions change.
  useEffect(() => {
    const g = layer.current, m = map.current
    if (!g || !m) return
    g.clearLayers()
    const pts: L.LatLngExpression[] = []
    if (stay?.lat != null) {
      const p = wgsToGcj(stay.lat, stay.lng!)
      L.marker(p, { icon: L.divIcon({ className: '', html: '<div class="map-pin hotel">宿</div>', iconSize: [30, 30] }) })
        .bindPopup(`<b>${stay.name}</b><br>${stay.address_zh ?? ''}`).addTo(g)
    }
    for (const l of live) {
      const p = wgsToGcj(l.lat, l.lng), me = l.member_id === session?.memberId
      pts.push(p)
      L.marker(p, { icon: L.divIcon({ className: '', html: `<div class="map-pin ${me ? 'me' : ''}">${initial(memberName(l.member_id))}</div>`, iconSize: [30, 30] }) })
        .bindPopup(`<b>${memberName(l.member_id)}</b><br>${ago(l.updated_at)}`).addTo(g)
      if (l.accuracy && l.accuracy < 500) L.circle(p, { radius: l.accuracy, color: '#c8102e', weight: 1, fillOpacity: .08 }).addTo(g)
    }
    if (pts.length && !fitted.current) {
      fitted.current = true
      m.fitBounds(L.latLngBounds(pts).pad(0.4), { maxZoom: 15 })
    }
  }, [live, stay, session, memberName])

  return (
    <main className="screen">
      <div className="stack">
        <div className="row between"><h2 style={{ margin: 0 }}>{stay?.city ?? 'Map'} · around us</h2><span className="chip">{live.length} sharing</span></div>
        <div className="map-live" ref={el} />
        <div className="bolleke">
          <button className={`bbtn ${bolleke.active ? 'on' : ''}`} aria-pressed={bolleke.active} onClick={() => (bolleke.active ? bolleke.stop() : bolleke.start())}>
            <svg viewBox="0 0 152 152" aria-hidden="true">
              <circle cx="76" cy="76" r="72" fill="none" stroke="rgba(244,235,221,.15)" strokeWidth="4" />
              <circle cx="76" cy="76" r="72" fill="none" stroke="#d6a84e" strokeWidth="4" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={bolleke.active ? RING * (1 - bolleke.left / 900) : RING} />
            </svg>
            <span className="g">点</span><span className="l">BOLLEKE</span>
          </button>
          <div className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
            {bolleke.active ? (
              <><b style={{ color: 'var(--paper)' }}>Sharing live · <span className="num">{String(Math.floor(bolleke.left / 60)).padStart(2, '0')}:{String(bolleke.left % 60).padStart(2, '0')}</span></b><br />Keep the app open. Tap again to stop.</>
            ) : 'Tap to share your live location with the group for 15 minutes'}
          </div>
          {bolleke.error && <p className="err" style={{ textAlign: 'center' }}>{bolleke.error}</p>}
        </div>
        <div className="card stack">
          <h3>Sharing now</h3>
          {live.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nobody is sharing right now.</p>}
          <div className="sharers">
            {live.map((l) => {
              const me = l.member_id === session?.memberId, mins = Math.ceil((Date.parse(l.expires_at) - Date.now()) / 60000)
              return (
                <button key={l.member_id} className="row between" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }}
                  onClick={() => map.current?.setView(wgsToGcj(l.lat, l.lng), 16)}>
                  <div className="row"><span className={`av ${me ? 'me' : ''}`}>{initial(memberName(l.member_id))}</span>
                    <div><b>{memberName(l.member_id)}{me ? ' (you)' : ''}</b><div className="muted" style={{ fontSize: 12 }}>Updated {ago(l.updated_at)}</div></div></div>
                  <span className="num muted" style={{ fontSize: 13 }}>{mins} min left</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )
}
