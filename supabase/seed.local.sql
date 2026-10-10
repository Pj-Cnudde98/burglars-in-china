-- Local development only. Loaded after seed.sql by `supabase start` and
-- `supabase db reset` (see [db.seed] in config.toml). Never run this on the
-- hosted project: there, the same things are set up by hand (README step 3).

-- What the schedule in 0002_scheduled_push.sql reads to call the tick function.
-- The address is how the database container reaches the local API gateway.
select vault.create_secret('http://api.supabase.internal:8000', 'project_url');
select vault.create_secret('local-webhook-secret', 'webhook_secret');

-- The hosted project calls the notify function through a database webhook made
-- in the dashboard. This is the same thing as a trigger.
create or replace function local_notify_webhook() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'http://api.supabase.internal:8000/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', 'local-webhook-secret'),
    body := jsonb_build_object('type', 'INSERT', 'table', 'messages', 'schema', 'public', 'record', to_jsonb(new))
  );
  return new;
end $$;

create trigger local_notify_webhook after insert on messages
  for each row execute function local_notify_webhook();
