-- Temp Chat Rooms: Supabase migration
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

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
