-- Burglars in China: schema, security rules and helper functions.
-- Run once in the Supabase SQL editor (or with `supabase db push`).
--
-- Login model: every phone signs in anonymously with Supabase Auth, then calls
-- join_trip(code, name). That links the phone (auth.uid()) to a trip member.
-- Admin rights belong to a phone, not a name, and are unlocked with the trip's
-- admin PIN through claim_admin(pin), so picking someone else's name does not
-- make you an admin.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table trips (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,            -- what friends type to join, e.g. DRAGON-27
  name text not null,
  start_date date not null,
  end_date date not null,
  admin_pin_hash text not null,         -- crypt(pin, gen_salt('bf'))
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (trip_id, name)
);

-- One row per phone. A member can be signed in on several phones.
create table devices (
  user_id uuid primary key references auth.users on delete cascade,
  member_id uuid not null references members on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Hotels / places we sleep. City is used to group the plan, food and weather.
create table stays (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  city text not null,
  city_zh text,
  name text not null,
  address_zh text,
  address_en text,
  phone text,
  check_in date not null,
  check_out date not null,
  booking_ref text,
  notes text,
  lat double precision,
  lng double precision
);

create table events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  day date not null,
  start_time time,
  title text not null,
  place_zh text,
  kind text not null default 'sight' check (kind in ('travel','sight','food','free','stay')),
  notes text,
  lat double precision,
  lng double precision
);
create index on events (trip_id, day, start_time);

create table transport (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  kind text not null default 'flight' check (kind in ('flight','train','bus','other')),
  from_place text not null,
  to_place text not null,
  from_zh text,
  to_zh text,
  depart_at timestamptz not null,
  arrive_at timestamptz,
  depart_tz text not null default 'Asia/Shanghai',  -- time zone to show times in
  arrive_tz text not null default 'Asia/Shanghai',
  code text,                -- flight or train number
  booking_ref text,
  seat text,
  file_path text,           -- ticket PDF or image in the "tickets" storage bucket
  notes text
);

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  city text not null,
  name text not null,
  name_zh text,
  dish text,
  notes text,
  added_by uuid references members on delete set null,
  created_at timestamptz not null default now()
);

create table votes (
  restaurant_id uuid not null references restaurants on delete cascade,
  member_id uuid not null references members on delete cascade,
  trip_id uuid not null references trips on delete cascade,
  value smallint not null check (value in (-1, 0, 1)),  -- 0 = vote removed (kept so realtime sees it)
  primary key (restaurant_id, member_id)
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  description text not null,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'CNY',
  paid_by uuid not null references members on delete cascade,
  split_with uuid[] not null,    -- member ids sharing the cost equally
  created_by uuid references members on delete set null,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  member_id uuid references members on delete set null,
  kind text not null default 'text' check (kind in ('text','bolleke')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on messages (trip_id, created_at);

-- Latest Bolleke position per member. Stored as plain GPS (WGS-84);
-- the app converts to the Chinese map grid (GCJ-02) when drawing.
create table locations (
  member_id uuid primary key references members on delete cascade,
  trip_id uuid not null references trips on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade,
  member_id uuid not null references members on delete cascade,
  trip_id uuid not null references trips on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers

create or replace function current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select member_id from devices where user_id = auth.uid()
$$;

create or replace function current_trip_id() returns uuid
language sql stable security definer set search_path = public as $$
  select m.trip_id from devices d join members m on m.id = d.member_id where d.user_id = auth.uid()
$$;

create or replace function is_trip_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_trip_id() = t, false)
$$;

create or replace function is_trip_admin(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from devices d join members m on m.id = d.member_id
    where d.user_id = auth.uid() and d.is_admin and m.trip_id = t
  )
$$;

-- Join (or re-join) a trip with its code and a display name.
create or replace function join_trip(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t trips;
  m_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into t from trips where upper(code) = upper(trim(p_code));
  if not found then raise exception 'Unknown trip code'; end if;

  insert into members (trip_id, name) values (t.id, trim(p_name))
  on conflict (trip_id, name) do update set name = excluded.name
  returning id into m_id;

  insert into devices (user_id, member_id) values (auth.uid(), m_id)
  on conflict (user_id) do update set member_id = excluded.member_id,
    is_admin = case when devices.member_id = excluded.member_id then devices.is_admin else false end;
  return m_id;
end $$;

-- Unlock admin rights on this phone with the trip's admin PIN.
create or replace function claim_admin(p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select crypt(p_pin, admin_pin_hash) = admin_pin_hash into ok
  from trips where id = current_trip_id();
  if coalesce(ok, false) then
    update devices set is_admin = true where user_id = auth.uid();
    return true;
  end if;
  return false;
end $$;

-- Lets the join screen show the trip name before you join.
create or replace function trip_preview(p_code text) returns table (name text, start_date date, end_date date)
language sql stable security definer set search_path = public as $$
  select name, start_date, end_date from trips where upper(code) = upper(trim(p_code))
$$;

revoke all on function join_trip, claim_admin, trip_preview from public;
grant execute on function join_trip, claim_admin, trip_preview to authenticated;

-- ---------------------------------------------------------------- row level security

alter table trips enable row level security;
alter table members enable row level security;
alter table devices enable row level security;
alter table stays enable row level security;
alter table events enable row level security;
alter table transport enable row level security;
alter table restaurants enable row level security;
alter table votes enable row level security;
alter table expenses enable row level security;
alter table messages enable row level security;
alter table locations enable row level security;
alter table push_subscriptions enable row level security;

-- trips: members can read their own trip; nobody edits through the API.
create policy "read own trip" on trips for select using (is_trip_member(id));

create policy "read members" on members for select using (is_trip_member(trip_id));

create policy "read own device" on devices for select using (user_id = auth.uid());

-- Plan data: everyone reads, only admins write.
create policy "read stays" on stays for select using (is_trip_member(trip_id));
create policy "admin write stays" on stays for all using (is_trip_admin(trip_id)) with check (is_trip_admin(trip_id));
create policy "read events" on events for select using (is_trip_member(trip_id));
create policy "admin write events" on events for all using (is_trip_admin(trip_id)) with check (is_trip_admin(trip_id));
create policy "read transport" on transport for select using (is_trip_member(trip_id));
create policy "admin write transport" on transport for all using (is_trip_admin(trip_id)) with check (is_trip_admin(trip_id));

-- Restaurants: everyone adds; you edit your own; admins edit all.
create policy "read restaurants" on restaurants for select using (is_trip_member(trip_id));
create policy "add restaurants" on restaurants for insert
  with check (is_trip_member(trip_id) and added_by = current_member_id());
create policy "edit restaurants" on restaurants for update
  using (added_by = current_member_id() or is_trip_admin(trip_id));
create policy "delete restaurants" on restaurants for delete
  using (added_by = current_member_id() or is_trip_admin(trip_id));

-- Votes: one per member per restaurant, only your own.
create policy "read votes" on votes for select using (is_trip_member(trip_id));
create policy "own votes" on votes for all
  using (member_id = current_member_id())
  with check (member_id = current_member_id() and is_trip_member(trip_id));

-- Expenses: everyone adds; creator or admin edits.
create policy "read expenses" on expenses for select using (is_trip_member(trip_id));
create policy "add expenses" on expenses for insert
  with check (is_trip_member(trip_id) and created_by = current_member_id());
create policy "edit expenses" on expenses for update
  using (created_by = current_member_id() or is_trip_admin(trip_id));
create policy "delete expenses" on expenses for delete
  using (created_by = current_member_id() or is_trip_admin(trip_id));

-- Chat: read all, post as yourself.
create policy "read messages" on messages for select using (is_trip_member(trip_id));
create policy "post messages" on messages for insert
  with check (is_trip_member(trip_id) and member_id = current_member_id());

-- Live locations: read all in trip, write your own.
create policy "read locations" on locations for select using (is_trip_member(trip_id));
create policy "own location" on locations for all
  using (member_id = current_member_id())
  with check (member_id = current_member_id() and is_trip_member(trip_id));

-- Push subscriptions: only your own phone's.
create policy "own push" on push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and member_id = current_member_id() and is_trip_member(trip_id));

-- ---------------------------------------------------------------- realtime

alter publication supabase_realtime add table
  members, stays, events, transport, restaurants, votes, expenses, messages, locations;

-- ---------------------------------------------------------------- ticket files

insert into storage.buckets (id, name, public) values ('tickets', 'tickets', false)
on conflict (id) do nothing;

-- Files live under <trip_id>/<file name>.
create policy "members read tickets" on storage.objects for select
  using (bucket_id = 'tickets' and is_trip_member(((storage.foldername(name))[1])::uuid));
create policy "admins upload tickets" on storage.objects for insert
  with check (bucket_id = 'tickets' and is_trip_admin(((storage.foldername(name))[1])::uuid));
create policy "admins delete tickets" on storage.objects for delete
  using (bucket_id = 'tickets' and is_trip_admin(((storage.foldername(name))[1])::uuid));
