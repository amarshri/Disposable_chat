# Temp Chat Rooms (MVP)

Minimal real-time temporary chat rooms with no authentication. Create a room,
share a code, and chat instantly.

## Features

- Create or join rooms with a 6-character code
- Real-time chat via Supabase Realtime
- Temporary messages with short cleanup window
- Minimal dark UI with responsive layout

## Tech Stack

- Next.js (App Router) + Tailwind CSS
- Supabase (Postgres + Realtime)
- Vercel (frontend deployment)

## Supabase Setup

1. Create a new Supabase project.
2. Create the `messages` table:

```sql
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  username text not null,
  content text not null,
  created_at timestamp with time zone default now()
);
```

3. Enable Realtime on the `messages` table in the Supabase dashboard.
4. Add Row Level Security (RLS) policies so anonymous users can read/write:

```sql
alter table public.messages enable row level security;

create policy "Allow anonymous read"
on public.messages
for select
to anon
using (true);

create policy "Allow anonymous insert"
on public.messages
for insert
to anon
with check (true);

create policy "Allow anonymous delete"
on public.messages
for delete
to anon
using (true);
```

## Environment Variables

Create a `.env.local` file:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

- Messages are only shown from live inserts. Refreshing the page clears the
  message list for that user.
- A cleanup task runs on the client to delete older messages periodically.
