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

1. Create a new Supabase project (free tier is fine).
2. Open the SQL editor and run `migration.sql` from the repo root.
3. Confirm Realtime is enabled for `public.messages`.

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
