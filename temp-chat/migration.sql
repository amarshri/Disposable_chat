-- Temp Chat Rooms: Supabase migration (presence + inactivity cleanup)
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- Drop legacy tracking objects (safe to re-run)
drop trigger if exists room_users_cleanup on public.room_users;
drop trigger if exists room_users_count_insert on public.room_users;
drop trigger if exists room_users_count_delete on public.room_users;

drop function if exists public.increment_room(text);
drop function if exists public.decrement_room(text);
drop function if exists public.leave_room(text, text);
drop function if exists public.cleanup_room_if_empty(text);
drop function if exists public.cleanup_room_if_empty();
drop function if exists public.cleanup_room_stale(text, integer);
drop function if exists public.sync_room_active_count();
drop function if exists public.cleanup_empty_rooms();

drop table if exists public.room_users;

-- Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  username text not null,
  content text not null,
  created_at timestamp with time zone not null default now()
);

create index if not exists messages_room_id_created_at_idx
  on public.messages (room_id, created_at desc);

alter table public.messages enable row level security;

drop policy if exists "Allow anonymous read" on public.messages;
create policy "Allow anonymous read"
  on public.messages
  for select
  to anon
  using (true);

drop policy if exists "Allow anonymous insert" on public.messages;
create policy "Allow anonymous insert"
  on public.messages
  for insert
  to anon
  with check (true);

drop policy if exists "Allow anonymous delete" on public.messages;
create policy "Allow anonymous delete"
  on public.messages
  for delete
  to anon
  using (true);

alter table public.messages replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Rooms
create table if not exists public.rooms (
  room_code text primary key,
  chat_mode text not null default 'anonymous',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.rooms enable row level security;

drop policy if exists "Allow anonymous room read" on public.rooms;
create policy "Allow anonymous room read"
  on public.rooms
  for select
  to anon
  using (true);

drop policy if exists "Allow anonymous room insert" on public.rooms;
create policy "Allow anonymous room insert"
  on public.rooms
  for insert
  to anon
  with check (true);

drop policy if exists "Allow anonymous room update" on public.rooms;
create policy "Allow anonymous room update"
  on public.rooms
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "Allow anonymous room delete" on public.rooms;
create policy "Allow anonymous room delete"
  on public.rooms
  for delete
  to anon
  using (true);

-- Room users (inactivity tracking)
create table if not exists public.room_users (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  username text not null,
  username_key text not null,
  last_seen timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  unique (room_code, username_key)
);

create index if not exists room_users_room_last_seen_idx
  on public.room_users (room_code, last_seen desc);

alter table public.room_users enable row level security;

drop policy if exists "Allow anonymous room users read" on public.room_users;
create policy "Allow anonymous room users read"
  on public.room_users
  for select
  to anon
  using (true);

drop policy if exists "Allow anonymous room users insert" on public.room_users;
create policy "Allow anonymous room users insert"
  on public.room_users
  for insert
  to anon
  with check (true);

drop policy if exists "Allow anonymous room users update" on public.room_users;
create policy "Allow anonymous room users update"
  on public.room_users
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "Allow anonymous room users delete" on public.room_users;
create policy "Allow anonymous room users delete"
  on public.room_users
  for delete
  to anon
  using (true);

-- Cleanup function: deletes room/messages when all users are stale
create or replace function public.cleanup_room_stale(p_room text, max_age_seconds integer default 60)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare removed_users integer;
begin
  delete from public.room_users
  where room_code = p_room
    and last_seen < now() - make_interval(secs => max_age_seconds);
  get diagnostics removed_users = row_count;
  if removed_users > 0 then
    raise notice 'cleanup_room_stale: removed % stale users from room %', removed_users, p_room;
  end if;

  if not exists (select 1 from public.room_users where room_code = p_room) then
    delete from public.messages where room_id = p_room;
    delete from public.rooms where room_code = p_room;
    raise notice 'cleanup_room_stale: deleted room % and its messages', p_room;
  end if;
end;
$$;

grant execute on function public.cleanup_room_stale(text, integer) to anon;

-- Cron job: run cleanup for all rooms every 60 seconds
create or replace function public.cleanup_all_rooms(max_age_seconds integer default 60)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in select room_code from public.rooms loop
    perform public.cleanup_room_stale(r.room_code, max_age_seconds);
  end loop;
end;
$$;

-- Replace any existing schedule with a 60-second job
select cron.unschedule('cleanup-empty-rooms');
select
  cron.schedule(
    'cleanup-empty-rooms',
    '*/1 * * * *',
    $$ select public.cleanup_all_rooms(60); $$
  );
