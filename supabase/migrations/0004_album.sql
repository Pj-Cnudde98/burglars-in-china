-- Shared photo album. Run once in the SQL editor, after 0003 (it uses the
-- "media" storage bucket created there; files go under <trip_id>/album/).

create table album_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  member_id uuid references members on delete set null,
  kind text not null default 'image' check (kind in ('image','video')),
  path text not null,
  thumb_path text,                -- small preview; null when none could be made (some videos)
  caption text check (char_length(caption) <= 200),
  taken_at timestamptz not null default now(),   -- when it was shot, as far as the phone knows
  created_at timestamptz not null default now()
);
create index on album_items (trip_id, taken_at);

alter table album_items enable row level security;

-- Everyone adds; you edit or remove your own; admins can remove any.
create policy "read album" on album_items for select using (is_trip_member(trip_id));
create policy "add to album" on album_items for insert
  with check (is_trip_member(trip_id) and member_id = current_member_id());
create policy "edit album" on album_items for update
  using (member_id = current_member_id() or is_trip_admin(trip_id));
create policy "delete from album" on album_items for delete
  using (member_id = current_member_id() or is_trip_admin(trip_id));

alter publication supabase_realtime add table album_items;
