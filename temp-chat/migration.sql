-- Temp Chat Rooms: Minimal realtime-only setup
-- This removes database storage for messages/rooms/users.
-- Run this in the Supabase SQL editor to drop legacy tables and cleanup jobs.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('cleanup-empty-rooms');
    exception
      when undefined_function then null;
      when others then null;
    end;
  end if;
end $$;

drop function if exists public.cleanup_all_rooms(integer);
drop function if exists public.cleanup_room_stale(text, integer);
drop function if exists public.cleanup_room_if_empty(text);
drop function if exists public.cleanup_room_if_empty();
drop function if exists public.increment_room(text);
drop function if exists public.decrement_room(text);
drop function if exists public.leave_room(text, text);
drop function if exists public.sync_room_active_count();
drop function if exists public.cleanup_empty_rooms();

drop table if exists public.room_users;
drop table if exists public.messages;
drop table if exists public.rooms;
