"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { normalizeRoomCode } from "@/lib/room";

type ChatMessage = {
  id: string;
  room_id: string;
  username: string;
  content: string;
  created_at: string;
};

type RoomClientProps = {
  roomId: string;
};

const CLEANUP_MINUTES = 30;

export default function RoomClient({ roomId }: RoomClientProps) {
  const normalizedRoomId = normalizeRoomCode(roomId);
  const isRoomValid = normalizedRoomId.length === 6;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"connecting" | "live">("connecting");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const username = useMemo(
    () => `User${Math.floor(1000 + Math.random() * 9000)}`,
    [],
  );

  useEffect(() => {
    if (!isRoomValid) {
      return;
    }

    const channel = supabase
      .channel(`room:${normalizedRoomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${normalizedRoomId}`,
        },
        (payload) => {
          const newMessage = payload.new as ChatMessage;
          setMessages((prev) => [...prev, newMessage].slice(-200));
        },
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") {
          setStatus("live");
        }
      });

    const cleanupOldMessages = async () => {
      const cutoff = new Date(Date.now() - CLEANUP_MINUTES * 60 * 1000);
      await supabase
        .from("messages")
        .delete()
        .eq("room_id", normalizedRoomId)
        .lt("created_at", cutoff.toISOString());
    };

    cleanupOldMessages();
    const cleanupInterval = setInterval(cleanupOldMessages, 5 * 60 * 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(cleanupInterval);
    };
  }, [isRoomValid, normalizedRoomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !isRoomValid) return;

    setInput("");
    await supabase.from("messages").insert({
      room_id: normalizedRoomId,
      username,
      content: trimmed,
    });
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3 rounded-3xl border border-border bg-card/80 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted">
                Room Code
              </p>
              <h1 className="text-2xl font-semibold text-foreground">
                {normalizedRoomId || "Invalid room"}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-xs uppercase tracking-[0.3em] text-accent">
                {status === "live" ? "Live" : "Connecting"}
              </span>
              <span className="rounded-full border border-border px-3 py-1 font-mono text-xs">
                {username}
              </span>
              <Link
                className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-foreground/40"
                href="/"
              >
                Leave Room
              </Link>
            </div>
          </div>
          <p className="text-sm text-muted">
            Share this code to invite others. Messages are temporary and cleared
            automatically.
          </p>
        </header>

        <section className="flex min-h-[60vh] flex-1 flex-col rounded-3xl border border-border bg-card/60">
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                {isRoomValid
                  ? "No messages yet. Say hello to get things going."
                  : "This room code is not valid. Go back and try again."}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((message) => {
                  const isOwn = message.username === username;
                  return (
                    <div
                      key={message.id}
                      className={`flex ${
                        isOwn ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl border px-4 py-3 text-sm leading-6 ${
                          isOwn
                            ? "border-accent/40 bg-accent/10 text-foreground"
                            : "border-border bg-black/30 text-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 text-xs text-muted">
                          <span className="font-medium text-foreground">
                            {message.username}
                          </span>
                          <span>{formatTime(message.created_at)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="border-t border-border px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor="messageInput" className="sr-only">
                Message
              </label>
              <input
                id="messageInput"
                name="message"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    sendMessage();
                  }
                }}
                placeholder="Type a message..."
                disabled={!isRoomValid}
                className="flex-1 rounded-2xl border border-border bg-black/40 px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!isRoomValid}
                className="rounded-2xl border border-accent/40 bg-accent/10 px-6 py-3 text-sm font-semibold text-foreground transition hover:border-accent/80 hover:bg-accent/20"
              >
                Send
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
