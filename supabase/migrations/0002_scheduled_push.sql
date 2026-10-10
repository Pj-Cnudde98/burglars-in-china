-- Time-based notifications: the "tick" edge function runs every 5 minutes and
-- sends the daily summary. Run once in the SQL editor, after 0001_init.sql.
--
-- Before the schedule can call the function, store two values in Vault
-- (replace both placeholders, then run these two lines once):
--
--   select vault.create_secret('https://YOUR-PROJECT.supabase.co', 'project_url');
--   select vault.create_secret('the-same-WEBHOOK_SECRET-as-the-functions', 'webhook_secret');

-- Trip days start and end in this zone; the daily summary goes out at 08:00 there.
alter table trips add column timezone text not null default 'Asia/Shanghai';

-- One row per notification already sent, so nothing is sent twice.
-- Keys look like "daily:2027-04-03".
create table push_log (
  trip_id uuid not null references trips on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (trip_id, key)
);
-- No policies: only the edge function (service role) reads or writes this.
alter table push_log enable row level security;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

select cron.schedule('trip-tick', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'webhook_secret')
    ),
    body := '{}'::jsonb
  )
$$);
