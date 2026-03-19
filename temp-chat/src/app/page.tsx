"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { generateRoomCode, normalizeRoomCode } from "@/lib/room";

export default function Home() {
  const router = useRouter();
  const [roomInput, setRoomInput] = useState("");
  const [glow, setGlow] = useState("----");

  useEffect(() => {
    setGlow(generateRoomCode(4));
  }, []);

  const handleCreate = () => {
    const code = generateRoomCode();
    router.push(`/room/${code}`);
  };

  const handleJoin = () => {
    const code = normalizeRoomCode(roomInput);
    if (code.length !== 6) {
      return;
    }
    router.push(`/room/${code}`);
  };

  const normalized = normalizeRoomCode(roomInput);

  return (
    <div className="min-h-screen px-6 py-10 text-foreground">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-muted">
            <span className="inline-flex h-2 w-2 rounded-full bg-accent shadow-[0_0_18px_rgba(109,220,255,0.7)]" />
            Temp Chat
          </div>
          <h1 className="text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            Spin up a room, share the code, and talk right now.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted sm:text-lg">
            Minimal, anonymous, and temporary chat rooms. Messages only live
            while you are in the room, and a short cleanup keeps rooms fresh.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-6 rounded-3xl border border-border bg-card/80 p-8 shadow-[var(--shadow)]">
            <div className="flex flex-col gap-3">
              <span className="text-sm uppercase tracking-[0.3em] text-muted">
                Create instantly
              </span>
              <h2 className="text-2xl font-semibold text-foreground">
                Your room is one click away.
              </h2>
              <p className="text-sm leading-6 text-muted">
                We generate a random 6-character code you can share with
                friends.
              </p>
            </div>
            <button
              onClick={handleCreate}
              className="group inline-flex items-center justify-between rounded-2xl border border-accent/40 bg-accent/10 px-6 py-4 text-base font-semibold text-foreground transition hover:border-accent/80 hover:bg-accent/20"
              type="button"
            >
              Create Room
              <span className="rounded-full bg-accent/20 px-3 py-1 font-mono text-xs tracking-[0.3em] text-accent">
                {glow}
              </span>
            </button>
          </div>

          <div className="flex flex-col gap-6 rounded-3xl border border-border bg-card/60 p-8">
            <div className="flex flex-col gap-3">
              <span className="text-sm uppercase tracking-[0.3em] text-muted">
                Join with code
              </span>
              <h2 className="text-2xl font-semibold text-foreground">
                Already have a room?
              </h2>
              <p className="text-sm leading-6 text-muted">
                Enter the room code below. We will take you straight in.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <label
                htmlFor="roomCode"
                className="text-xs uppercase tracking-[0.3em] text-muted"
              >
                Room code
              </label>
              <input
                id="roomCode"
                name="roomCode"
                value={roomInput}
                onChange={(event) => setRoomInput(event.target.value)}
                placeholder="e.g. H7K4Q9"
                className="rounded-2xl border border-border bg-black/40 px-4 py-3 font-mono text-lg tracking-[0.35em] text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                maxLength={6}
              />
              <button
                onClick={handleJoin}
                disabled={normalized.length !== 6}
                className="rounded-2xl border border-border bg-foreground/10 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
              >
                Join Room
              </button>
              <p className="text-xs text-muted">
                Only letters and numbers are accepted.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
