// Sends a push notification to everyone in the trip when a chat message or a
// Bolleke is posted. Called by a Supabase database webhook on INSERT into
// public.messages (see README). Secrets are listed in ../_shared/push.ts.

import { authorized, sendToTrip, supabase } from '../_shared/push.ts'

type Message = { id: string; trip_id: string; member_id: string | null; kind: 'text' | 'bolleke' | 'image' | 'poll'; body: string }

const PREFIX: Record<string, string> = { image: '📷 ', poll: '📊 ' }

Deno.serve(async (req) => {
  if (!authorized(req)) return new Response('forbidden', { status: 403 })
  const payload = await req.json()
  const msg = payload.record as Message
  if (!msg?.trip_id) return new Response('ignored')

  const { data: sender } = await supabase.from('members').select('name').eq('id', msg.member_id).maybeSingle()
  const name = sender?.name ?? 'Someone'

  const notification =
    msg.kind === 'bolleke'
      ? { title: `📍 ${name} pressed Bolleke`, body: 'Tap to see where on the map', url: '/#map', tag: `bolleke-${msg.member_id}` }
      : { title: name, body: `${PREFIX[msg.kind] ?? ''}${msg.body}`.slice(0, 140), url: '/#chat', tag: 'chat' }

  const sent = await sendToTrip(msg.trip_id, notification, { except: msg.member_id, urgent: msg.kind === 'bolleke' })
  return Response.json({ sent })
})
