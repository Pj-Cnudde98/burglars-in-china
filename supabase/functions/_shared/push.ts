// Shared by the edge functions: the service-role client and web push sending.
//
// Secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com)
//   WEBHOOK_SECRET  (same value as the caller's x-webhook-secret header)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

export const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
)

export type Notification = { title: string; body: string; url: string; tag: string }

export function authorized(req: Request) {
  return req.headers.get('x-webhook-secret') === Deno.env.get('WEBHOOK_SECRET')
}

/** Push to every phone in the trip, optionally skipping one member. Returns how many were sent. */
export async function sendToTrip(
  tripId: string,
  notification: Notification,
  opts: { except?: string | null; urgent?: boolean } = {}
) {
  let q = supabase.from('push_subscriptions').select('endpoint, p256dh, auth').eq('trip_id', tripId)
  if (opts.except) q = q.neq('member_id', opts.except)
  const { data: subs } = await q

  const gone: string[] = []
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(notification),
          { TTL: 60 * 60, urgency: opts.urgent ? 'high' : 'normal' }
        )
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) gone.push(s.endpoint) // phone unsubscribed
        else console.error('push failed', code, err)
      }
    })
  )
  if (gone.length) await supabase.from('push_subscriptions').delete().in('endpoint', gone)
  return (subs?.length ?? 0) - gone.length
}
