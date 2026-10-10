import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { Session, TripData } from './types'
import { cacheTickets } from './tickets'

// Everything the app shows is loaded once, saved on the phone, and kept fresh
// with realtime updates. When there is no signal the saved copy is shown.

const EMPTY: TripData = {
  trip: null, members: [], stays: [], events: [], transport: [], restaurants: [],
  votes: [], expenses: [], messages: [], pollVotes: [], locations: []
}
type TableKey = Exclude<keyof TripData, 'trip'>
const TABLES: Record<TableKey, { table: string; order?: [string, boolean] }> = {
  members: { table: 'members', order: ['name', true] },
  stays: { table: 'stays', order: ['check_in', true] },
  events: { table: 'events', order: ['start_time', true] },
  transport: { table: 'transport', order: ['depart_at', true] },
  restaurants: { table: 'restaurants', order: ['created_at', true] },
  votes: { table: 'votes' },
  expenses: { table: 'expenses', order: ['created_at', true] },
  messages: { table: 'messages', order: ['created_at', true] },
  pollVotes: { table: 'poll_votes' },
  locations: { table: 'locations' }
}
const SESSION_KEY = 'bic-session'
const dataKey = (tripId: string) => `bic-data-${tripId}`

function readJson<T>(key: string): T | null {
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : null } catch { return null }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage full or blocked */ }
}

type Store = {
  session: Session | null
  data: TripData
  online: boolean
  syncedAt: string | null
  join: (code: string, name: string) => Promise<void>
  claimAdmin: (pin: string) => Promise<boolean>
  signOut: () => Promise<void>
  refresh: (key?: TableKey) => Promise<void>
  memberName: (id: string | null) => string
}
const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readJson<Session>(SESSION_KEY))
  const [data, setData] = useState<TripData>(() => {
    const s = readJson<Session>(SESSION_KEY)
    const saved = s && readJson<TripData>(dataKey(s.tripId))
    // A copy saved by an older version of the app may lack the newer lists.
    return saved ? { ...EMPTY, ...saved } : EMPTY
  })
  const [online, setOnline] = useState(navigator.onLine)
  const [syncedAt, setSyncedAt] = useState<string | null>(() => readJson<string>('bic-synced'))
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    addEventListener('online', on); addEventListener('offline', off)
    return () => { removeEventListener('online', on); removeEventListener('offline', off) }
  }, [])

  const save = useCallback((next: TripData) => {
    setData(next)
    if (next.trip) writeJson(dataKey(next.trip.id), next)
  }, [])

  const refresh = useCallback(async (key?: TableKey) => {
    if (!session) return
    const keys = key ? [key] : (Object.keys(TABLES) as TableKey[])
    const results = await Promise.all(keys.map(async (k) => {
      let q = supabase.from(TABLES[k].table).select('*').eq('trip_id', session.tripId)
      const o = TABLES[k].order
      if (o) q = q.order(o[0], { ascending: o[1], nullsFirst: true })
      const { data: rows, error } = await q
      if (error) throw error
      return [k, rows] as const
    }))
    const next: TripData = { ...dataRef.current }
    for (const [k, rows] of results) (next as Record<string, unknown>)[k] = rows
    if (!key) {
      const { data: trip, error } = await supabase.from('trips').select('id,code,name,start_date,end_date').eq('id', session.tripId).single()
      if (error) throw error
      next.trip = trip
      const now = new Date().toISOString()
      setSyncedAt(now); writeJson('bic-synced', now)
    }
    save(next)
    if (!key || key === 'transport') cacheTickets(next.transport).catch(() => {})
  }, [session, save])

  // Initial load + realtime subscriptions.
  useEffect(() => {
    if (!session) return
    refresh().catch(() => { /* offline: keep the saved copy */ })
    const ch = supabase.channel(`trip-${session.tripId}`)
    for (const [k, { table }] of Object.entries(TABLES) as [TableKey, { table: string }][]) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `trip_id=eq.${session.tripId}` },
        () => { refresh(k).catch(() => {}) })
    }
    ch.subscribe()
    const onVisible = () => { if (document.visibilityState === 'visible') refresh().catch(() => {}) }
    document.addEventListener('visibilitychange', onVisible)
    addEventListener('online', onVisible)
    return () => {
      supabase.removeChannel(ch)
      document.removeEventListener('visibilitychange', onVisible)
      removeEventListener('online', onVisible)
    }
  }, [session, refresh])

  const join = useCallback(async (code: string, name: string) => {
    const { data: auth } = await supabase.auth.getSession()
    if (!auth.session) {
      const { error } = await supabase.auth.signInAnonymously()
      if (error) throw error
    }
    const { data: memberId, error } = await supabase.rpc('join_trip', { p_code: code, p_name: name })
    if (error) throw new Error(error.message.includes('Unknown trip code') ? 'That trip code does not exist. Check the spelling.' : error.message)
    const { data: member } = await supabase.from('members').select('trip_id').eq('id', memberId).single()
    const { data: device } = await supabase.from('devices').select('is_admin').maybeSingle()
    const s: Session = { memberId, tripId: member!.trip_id, name: name.trim(), isAdmin: Boolean(device?.is_admin) }
    writeJson(SESSION_KEY, s)
    setSession(s)
  }, [])

  const claimAdmin = useCallback(async (pin: string) => {
    const { data: ok, error } = await supabase.rpc('claim_admin', { p_pin: pin })
    if (error || !ok) return false
    setSession((s) => { const n = s && { ...s, isAdmin: true }; writeJson(SESSION_KEY, n); return n })
    return true
  }, [])

  const signOut = useCallback(async () => {
    try { localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
    await supabase.auth.signOut().catch(() => {})
    setSession(null); setData(EMPTY)
  }, [])

  const memberName = useCallback((id: string | null) => data.members.find((m) => m.id === id)?.name ?? 'Someone', [data.members])

  const value = useMemo(() => ({ session, data, online, syncedAt, join, claimAdmin, signOut, refresh, memberName }),
    [session, data, online, syncedAt, join, claimAdmin, signOut, refresh, memberName])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
