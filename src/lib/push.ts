import { supabase } from './supabase'
import type { Session } from './types'

// Web push. On iPhone this only works after "Add to Home Screen" (iOS 16.4+).
// On Android it goes through Google's push service, which needs the eSIM's
// non-China data route.

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export function pushSupport(): 'ok' | 'install' | 'unsupported' | 'unconfigured' {
  if (!VAPID) return 'unconfigured'
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  if (ios && !standalone) return 'install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return 'ok'
}

function b64ToBytes(b64: string) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

export async function isSubscribed() {
  if (pushSupport() !== 'ok') return false
  const reg = await navigator.serviceWorker.getRegistration()
  return Boolean(await reg?.pushManager.getSubscription()) && Notification.permission === 'granted'
}

export async function enablePush(session: Session) {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notifications are blocked. Turn them on for this app in your phone settings.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID!) }))
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
    user_id: auth.user!.id, member_id: session.memberId, trip_id: session.tripId
  })
  if (error) throw error
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}
