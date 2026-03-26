-- Temp Chat Rooms: Supabase migration
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  username text not null,
  content text not null,
  created_at timestamp with time zone not null default now(),
  message_type text not null default 'user'
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

create table if not exists public.rooms (
  room_code text primary key,
  chat_mode text not null default 'anonymous',
  active_count integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.rooms
  add column if not exists chat_mode text not null default 'anonymous';

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

create or replace function public.increment_room(p_room text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare new_count integer;
begin
  insert into public.rooms (room_code, active_count, updated_at)
  values (p_room, 1, now())
  on conflict (room_code)
  do update set active_count = public.rooms.active_count + 1,
               updated_at = now()
  returning active_count into new_count;

  return new_count;
end;
$$;

create or replace function public.decrement_room(p_room text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare new_count integer;
begin
  update public.rooms
  set active_count = greatest(active_count - 1, 0),
      updated_at = now()
  where room_code = p_room
  returning active_count into new_count;

  if new_count is null then
    return 0;
  end if;

  if new_count = 0 then
    delete from public.room_users where room_code = p_room;
    delete from public.messages where room_id = p_room;
    delete from public.rooms where room_code = p_room;
  end if;

  return new_count;
end;
$$;

grant execute on function public.increment_room(text) to anon;
grant execute on function public.decrement_room(text) to anon;

create table if not exists public.room_users (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  username text not null,
  username_key text not null,
  created_at timestamp with time zone not null default now(),
  unique (room_code, username_key)
);

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

drop policy if exists "Allow anonymous room users delete" on public.room_users;
create policy "Allow anonymous room users delete"
  on public.room_users
  for delete
  to anon
  using (true);

create or replace function public.sync_room_active_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare room_count integer;
begin
  select count(*) into room_count
  from public.room_users
  where room_code = coalesce(new.room_code, old.room_code);

  update public.rooms
  set active_count = room_count,
      updated_at = now()
  where room_code = coalesce(new.room_code, old.room_code);

  return coalesce(new, old);
end;
$$;

drop trigger if exists room_users_count_insert on public.room_users;
create trigger room_users_count_insert
after insert on public.room_users
for each row execute function public.sync_room_active_count();

drop trigger if exists room_users_count_delete on public.room_users;
create trigger room_users_count_delete
after delete on public.room_users
for each row execute function public.sync_room_active_count();

create or replace function public.cleanup_room_if_empty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.room_users where room_code = old.room_code
  ) then
    delete from public.messages where room_id = old.room_code;
    delete from public.rooms where room_code = old.room_code;
  end if;
  return old;
end;
$$;

drop trigger if exists room_users_cleanup on public.room_users;
create trigger room_users_cleanup
after delete on public.room_users
for each row execute function public.cleanup_room_if_empty();

create or replace function public.cleanup_room_if_empty(p_room text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.room_users where room_code = p_room) then
    delete from public.messages where room_id = p_room;
    delete from public.rooms where room_code = p_room;
  end if;
end;
$$;

grant execute on function public.cleanup_room_if_empty(text) to anon;
