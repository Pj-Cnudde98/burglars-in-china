import { useStore } from '../lib/store'
import { dow, fmtShort, hhmm, dayNum, MONTHS } from '../lib/dates'
import { cities, focusDay, routeKm, stayFor, tripInfo } from '../lib/trip'
import { useForecast, weatherIcon } from '../lib/weather'
import type { Stay } from '../lib/types'

const SEAL_CHAR: Record<string, string> = { Beijing: '京', "Xi'an": '秦', Chengdu: '蜀', Zhangjiajie: '山', Guilin: '桂', Shanghai: '沪' }

export default function Today({ go }: { go: (h: string) => void }) {
  const { data, session } = useStore()
  const trip = data.trip
  const day = trip ? focusDay(trip) : ''
  const stay = trip ? stayFor(day, data.stays) : null
  const forecast = useForecast(stay?.lat, stay?.lng)
  if (!trip) return <main className="screen"><div className="empty">Loading your trip…</div></main>

  const info = tripInfo(trip)
  const next = data.events.filter((e) => e.day === day).slice(0, 4)
  const city = stay?.city ?? ''

  return (
    <main className="screen">
      <div className="stack">
        <div className="row between"><span className="eyebrow">Ni hao, {session?.name}</span>
          {info.startsIn > 0 && <span className="chip red">{info.startsIn} days to go</span>}
        </div>
        <div className="hero">
          <div className="char">{SEAL_CHAR[city] ?? stay?.city_zh?.[0] ?? '游'}</div>
          <div className="day">Day {info.dayIndex(day)} of {info.total} · {fmtShort(day)}</div>
          <div className="city">{city || 'On the road'} {stay?.city_zh && <span className="zh" style={{ fontSize: 18, opacity: .8 }}>{stay.city_zh}</span>}</div>
          {stay && <div className="meta">Staying at {stay.name}</div>}
        </div>

        <div className="card stack">
          <div className="row between"><h3>{info.startsIn > 0 ? 'Day 1 plan' : 'Today'}</h3><button className="btn ghost sm" onClick={() => go('plan')}>Full day</button></div>
          {next.length ? next.map((e) => (
            <div className="row" key={e.id}>
              <span className="num" style={{ fontWeight: 700, width: 46, flex: 'none' }}>{hhmm(e.start_time)}</span>
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{e.title}</div>{e.place_zh && <div className="zh muted" style={{ fontSize: 12 }}>{e.place_zh}</div>}</div>
            </div>
          )) : <p className="muted" style={{ margin: 0 }}>Nothing planned. Free day!</p>}
        </div>

        {stay?.lat != null && (
          <div className="card stack">
            <div className="row between"><h3>Weather in {city}</h3><span className="muted" style={{ fontSize: 12 }}>°C</span></div>
            {forecast ? (
              <div className="weather">
                {forecast.map((f) => <div key={f.date}>{dow(f.date)}<span className="ic">{weatherIcon(f.code)}</span><b>{f.max}°</b><span className="muted">{f.min}°</span></div>)}
              </div>
            ) : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Forecast appears when you have signal.</p>}
          </div>
        )}

        {data.stays.length > 0 && <RouteCard stays={data.stays} day={day} />}
      </div>
    </main>
  )
}

function RouteCard({ stays, day }: { stays: Stay[]; day: string }) {
  const list = cities(stays)
  const pts = list.filter((s) => s.lat != null && s.lng != null)
  const W = 340, H = 230, P = 34
  const lats = pts.map((p) => p.lat!), lngs = pts.map((p) => p.lng!)
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  const sx = (W - 2 * P) / Math.max(maxLng - minLng, 1), sy = (H - 2 * P) / Math.max(maxLat - minLat, 1)
  const s = Math.min(sx, sy)
  const ox = (W - (maxLng - minLng) * s) / 2, oy = (H - (maxLat - minLat) * s) / 2
  const xy = (p: Stay) => [ox + (p.lng! - minLng) * s, H - oy - (p.lat! - minLat) * s]
  const range = (c: string) => {
    const mine = stays.filter((x) => x.city === c)
    return [mine[0].check_in, mine[mine.length - 1].check_out]
  }
  const label = (d: string) => `${dayNum(d)} ${MONTHS[+d.slice(5, 7) - 1]}`

  return (
    <div className="card stack route">
      <div className="row between"><h3>Our route</h3><span className="muted num" style={{ fontSize: 12 }}>{list.length} cities · ~{routeKm(stays).toLocaleString('en')} km</span></div>
      {pts.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Route map">
          <defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#3a2a2b" strokeWidth=".5" /></pattern></defs>
          <rect width={W} height={H} fill="url(#grid)" rx="10" />
          <polyline points={pts.map((p) => xy(p).join(',')).join(' ')} fill="none" stroke="#8e0b20" strokeWidth="3" strokeDasharray="6 5" />
          {pts.map((p) => {
            const [x, y] = xy(p), [a, b] = range(p.city)
            const now = day >= a && day < b, past = day >= b
            const right = x > W * 0.7
            return (
              <g key={p.id}>
                <circle cx={x} cy={y} r={now ? 9 : 6} fill={now ? '#c8102e' : past ? '#8e0b20' : '#0d0a0a'} stroke={now ? '#f4ebdd' : '#c8102e'} strokeWidth="2" />
                <text x={x + (right ? -12 : 12)} y={y + 4} textAnchor={right ? 'end' : 'start'} fill="#f4ebdd" fontSize="12" fontWeight="700">{p.city}</text>
                <text x={x + (right ? -12 : 12)} y={y + 17} textAnchor={right ? 'end' : 'start'} fill="#b3a497" fontSize="10">{label(a)} to {label(b)}</text>
              </g>
            )
          })}
        </svg>
      )}
      <div className="legs">
        {list.map((c) => { const [a, b] = range(c.city); return <span key={c.id} className={`leg ${day >= a && day < b ? 'now' : ''}`}>{c.city_zh} {c.city} · {Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 864e5))} nights</span> })}
      </div>
    </div>
  )
}
