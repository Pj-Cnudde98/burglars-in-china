-- Photos and polls in the group chat. Run once in the SQL editor, after 0002.

-- ---------------------------------------------------------------- messages

alter table messages drop constraint messages_kind_check;
alter table messages
  add column image_path text,      -- photo in the "media" storage bucket (kind = 'image')
  add column poll_options text[],  -- answers to choose from (kind = 'poll'); body is the question
  add constraint messages_kind_check check (kind in ('text','bolleke','image','poll')),
  add constraint messages_image_check check ((kind = 'image') = (image_path is not null)),
  add constraint messages_poll_check check (
    (kind = 'poll') = (poll_options is not null)
    and (poll_options is null or cardinality(poll_options) between 2 and 6)
  );

-- One answer per member per poll.
create table poll_votes (
  message_id uuid not null references messages on delete cascade,
  member_id uuid not null references members on delete cascade,
  trip_id uuid not null references trips on delete cascade,
  choice smallint,  -- position in poll_options, from 0; null = vote removed (kept so realtime sees it)
  primary key (message_id, member_id)
);

alter table poll_votes enable row level security;
create policy "read poll votes" on poll_votes for select using (is_trip_member(trip_id));
create policy "own poll votes" on poll_votes for all
  using (member_id = current_member_id())
  with check (member_id = current_member_id() and is_trip_member(trip_id));

alter publication supabase_realtime add table poll_votes;

-- ---------------------------------------------------------------- photos and videos

-- Files live under <trip_id>/<folder>/<file name>. Everyone in the trip can add
-- and see them; you can remove your own, admins can remove any.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 52428800)  -- 50 MB, the free plan's limit per file
on conflict (id) do nothing;

create policy "members read media" on storage.objects for select
  using (bucket_id = 'media' and is_trip_member(((storage.foldername(name))[1])::uuid));
create policy "members upload media" on storage.objects for insert
  with check (bucket_id = 'media' and is_trip_member(((storage.foldername(name))[1])::uuid));
create policy "delete own media" on storage.objects for delete
  using (bucket_id = 'media' and (owner_id = auth.uid()::text or is_trip_admin(((storage.foldername(name))[1])::uuid)));
