// Sends a push notification to everyone in the trip when a chat message or a
// Bolleke is posted. Called by a Supabase database webhook on INSERT into
// public.messages (see README).
//
// Secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com)
//   WEBHOOK_SECRET  (same value as the webhook's x-webhook-secret header)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
)

type Message = { id: string; trip_id: string; member_id: string | null; kind: 'text' | 'bolleke'; body: string }

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }
  const payload = await req.json()
  const msg = payload.record as Message
  if (!msg?.trip_id) return new Response('ignored')

  const { data: sender } = await supabase.from('members').select('name').eq('id', msg.member_id).maybeSingle()
  const name = sender?.name ?? 'Someone'

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, member_id')
    .eq('trip_id', msg.trip_id)
    .neq('member_id', msg.member_id)

  const notification =
    msg.kind === 'bolleke'
      ? { title: `📍 ${name} pressed Bolleke`, body: 'Tap to see where on the map', url: '/#map', tag: `bolleke-${msg.member_id}` }
      : { title: name, body: msg.body.slice(0, 140), url: '/#chat', tag: 'chat' }

  const gone: string[] = []
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(notification),
          { TTL: 60 * 60, urgency: msg.kind === 'bolleke' ? 'high' : 'normal' }
        )
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) gone.push(s.endpoint) // phone unsubscribed
        else console.error('push failed', code, err)
      }
    })
  )
  if (gone.length) await supabase.from('push_subscriptions').delete().in('endpoint', gone)

  return Response.json({ sent: (subs?.length ?? 0) - gone.length })
})
