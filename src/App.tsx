import { useEffect, useState } from 'react'
import { useStore } from './lib/store'
import { configured } from './lib/supabase'
import { useBolleke } from './lib/bolleke'
import { ToastProvider } from './components/ui'
import Login from './screens/Login'
import Today from './screens/Today'
import Plan from './screens/Plan'
import MapScreen from './screens/MapScreen'
import Food from './screens/Food'
import Info from './screens/Info'

export type Tab = 'today' | 'plan' | 'map' | 'food' | 'info'
const TABS: { id: Tab; g: string; label: string }[] = [
  { id: 'today', g: '今', label: 'Today' },
  { id: 'plan', g: '程', label: 'Plan' },
  { id: 'map', g: '点', label: 'Bolleke' },
  { id: 'food', g: '食', label: 'Food' },
  { id: 'info', g: '更', label: 'Info' }
]
// True when started with `npm run dev:local`: the backend is the Docker stack on this computer.
const LOCAL = import.meta.env.MODE === 'docker'
const INFO_SUBS = ['hotels', 'transport', 'money', 'chat', 'album', 'translate', 'settings']

// Hash routes: #today, #plan, #map, #food, #info, #chat, #hotels, ...
function parseHash(): { tab: Tab; sub: string | null } {
  const h = location.hash.slice(1)
  if (INFO_SUBS.includes(h)) return { tab: 'info', sub: h }
  if (TABS.some((t) => t.id === h)) return { tab: h as Tab, sub: null }
  return { tab: 'today', sub: null }
}

export default function App() {
  const { session, data, online, syncedAt } = useStore()
  const [route, setRoute] = useState(parseHash)
  const bolleke = useBolleke(session)

  useEffect(() => {
    const on = () => setRoute(parseHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const go = (h: string) => { location.hash = h }

  if (!configured) {
    return <div className="phone"><main className="screen"><h2>Almost there</h2><p className="muted">This copy of the app has no Supabase settings yet. Copy <code>.env.example</code> to <code>.env</code> and fill it in, as described in the README.</p></main></div>
  }

  return (
    <ToastProvider>
      <div className="stage">
        <div className="phone">
          <div className="lattice" />
          {!session ? <Login /> : (
            <>
              <header className="top">
                <div className="seal" aria-hidden="true">贼</div>
                <div className="grow">
                  <h1>{data.trip?.name ?? 'Burglars in China'}</h1>
                  <div className="sub">{data.members.length ? `${data.members.length} travellers` : 'Loading…'}{session.isAdmin ? ' · admin' : ''}{LOCAL ? ' · local database' : ''}</div>
                </div>
                <span className="chip off" title={syncedAt ? `Last synced ${new Date(syncedAt).toLocaleString()}` : ''}><span className="dot" />{online ? 'Offline ready' : 'Offline'}</span>
              </header>
              {!online && <div className="offline-bar">No signal. Showing your saved plan, hotels and tickets.</div>}
              {route.tab === 'today' && <Today go={go} />}
              {route.tab === 'plan' && <Plan />}
              {route.tab === 'map' && <MapScreen bolleke={bolleke} />}
              {route.tab === 'food' && <Food />}
              {route.tab === 'info' && <Info sub={route.sub} go={go} />}
              <nav className="nav" aria-label="Main">
                {TABS.map((t) => (
                  <button key={t.id} className={t.id === 'map' ? 'bol' : ''} aria-current={route.tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
                    <span className="g">{t.g}</span>{t.id === 'map' && bolleke.active ? `${Math.ceil(bolleke.left / 60)} min` : t.label}
                  </button>
                ))}
              </nav>
            </>
          )}
        </div>
      </div>
    </ToastProvider>
  )
}
