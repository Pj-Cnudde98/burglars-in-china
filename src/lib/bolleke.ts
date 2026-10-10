import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { Session } from './types'

export const BOLLEKE_MINUTES = 15

// Shares this phone's position for 15 minutes. Web apps can only read the
// location while the app is open, so the screen is kept awake while sharing.
export function useBolleke(session: Session | null) {
  const [until, setUntil] = useState<number | null>(() => {
    try { const v = Number(localStorage.getItem('bic-bolleke-until')); return v > Date.now() ? v : null } catch { return null }
  })
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState<string | null>(null)
  const watch = useRef<number | null>(null)
  const lastSent = useRef(0)
  const wake = useRef<WakeLockSentinel | null>(null)

  const stopWatching = useCallback(() => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current)
    watch.current = null
    wake.current?.release().catch(() => {})
    wake.current = null
  }, [])

  const stop = useCallback(async () => {
    stopWatching()
    setUntil(null)
    try { localStorage.removeItem('bic-bolleke-until') } catch { /* ignore */ }
    if (session) await supabase.from('locations').update({ expires_at: new Date().toISOString() }).eq('member_id', session.memberId)
  }, [session, stopWatching])

  const startWatching = useCallback((end: number) => {
    if (!session) return
    stopWatching()
    navigator.wakeLock?.request('screen').then((w) => { wake.current = w }).catch(() => {})
    watch.current = navigator.geolocation.watchPosition(
      async (pos) => {
        if (Date.now() - lastSent.current < 10_000) return // at most every 10 s
        lastSent.current = Date.now()
        setError(null)
        await supabase.from('locations').upsert({
          member_id: session.memberId, trip_id: session.tripId,
          lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy,
          expires_at: new Date(end).toISOString(), updated_at: new Date().toISOString()
        })
      },
      (err) => setError(err.code === err.PERMISSION_DENIED
        ? 'Location is blocked. Allow location for this app in your phone settings.'
        : 'Could not get your location. Try again outside.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    )
  }, [session, stopWatching])

  const start = useCallback(async () => {
    if (!session) return
    const end = Date.now() + BOLLEKE_MINUTES * 60_000
    setUntil(end)
    try { localStorage.setItem('bic-bolleke-until', String(end)) } catch { /* ignore */ }
    lastSent.current = 0
    startWatching(end)
    // The chat message is what triggers the push notification to everyone.
    await supabase.from('messages').insert({ trip_id: session.tripId, member_id: session.memberId, kind: 'bolleke', body: `${session.name} pressed Bolleke` })
  }, [session, startWatching])

  // Resume after reopening the app, tick the countdown, stop at the end.
  useEffect(() => {
    if (!until) return
    if (watch.current == null) startWatching(until)
    const id = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= until) stop()
    }, 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && until > Date.now()) startWatching(until)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [until, startWatching, stop])

  useEffect(() => stopWatching, [stopWatching])

  const left = until ? Math.max(0, Math.round((until - now) / 1000)) : 0
  return { active: Boolean(until) && left > 0, left, start, stop, error }
}
