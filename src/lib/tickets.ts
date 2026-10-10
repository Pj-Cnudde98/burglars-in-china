import { supabase } from './supabase'
import type { Transport } from './types'

// Ticket files are downloaded once and kept in the phone's Cache Storage, so
// they open on a train with no signal.
const CACHE = 'bic-tickets'
const keyFor = (path: string) => `/__ticket/${encodeURIComponent(path)}`

export async function cacheTickets(items: Transport[]) {
  if (!('caches' in window)) return
  const cache = await caches.open(CACHE)
  for (const t of items) {
    if (!t.file_path || (await cache.match(keyFor(t.file_path)))) continue
    const { data } = await supabase.storage.from('tickets').download(t.file_path)
    if (data) await cache.put(keyFor(t.file_path), new Response(data, { headers: { 'content-type': data.type } }))
  }
}

export async function openTicket(path: string): Promise<string | null> {
  if ('caches' in window) {
    const hit = await (await caches.open(CACHE)).match(keyFor(path))
    if (hit) return URL.createObjectURL(await hit.blob())
  }
  const { data } = await supabase.storage.from('tickets').download(path)
  return data ? URL.createObjectURL(data) : null
}

export async function uploadTicket(tripId: string, file: File) {
  const path = `${tripId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`
  const { error } = await supabase.storage.from('tickets').upload(path, file, { contentType: file.type })
  if (error) throw error
  return path
}
