"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { normalizeRoomCode } from "@/lib/room";
import ThemeToggle from "@/components/theme-toggle";
import type { RealtimeChannel } from "@supabase/supabase-js";

type ChatMessage = {
  id: string;
  username: string;
  content: string;
  created_at: string;
  message_type?: "user" | "system";
};

type RoomClientProps = {
  roomId: string;
};

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export default function RoomClient({ roomId }: RoomClientProps) {
  const router = useRouter();
  const params = useParams();
  const routeRoomId =
    typeof params.roomId === "string"
      ? params.roomId
      : Array.isArray(params.roomId)
        ? params.roomId[0]
        : roomId;
  const normalizedRoomId = normalizeRoomCode(routeRoomId || roomId);
  const isRoomValid = normalizedRoomId.length === 6;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"connecting" | "live">("connecting");
  const [username, setUsername] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const presenceKeyRef = useRef("");

  const displayRoomCode = useMemo(
    () => (isRoomValid ? normalizedRoomId : "Invalid room"),
    [isRoomValid, normalizedRoomId],
  );

  const appendMessage = (message: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((item) => item.id === message.id)) {
        return prev;
      }
      return [...prev, message].slice(-200);
    });
  };

  useEffect(() => {
    const savedName = sessionStorage.getItem("chatName") ?? "";
    if (savedName.trim()) {
      setUsername(savedName.trim());
      return;
    }
    setUsername(`User${Math.floor(1000 + Math.random() * 9000)}`);
  }, []);

  useEffect(() => {
    if (!isRoomValid || !username) {
      return;
    }

    const presenceKey =
      presenceKeyRef.current || `${username}-${generateId()}`;
    presenceKeyRef.current = presenceKey;

    const channel = supabase.channel(`room:${normalizedRoomId}`, {
      config: {
        broadcast: { self: true },
        presence: { key: presenceKey },
      },
    });

    channelRef.current = channel;

    channel.on(
      "broadcast",
      { event: "message" },
      ({ payload }) => {
        if (!payload) return;
        appendMessage(payload as ChatMessage);
      },
    );

    channel.on(
      "presence",
      { event: "join" },
      ({ newPresences }) => {
        newPresences.forEach((presence) => {
          const name =
            (presence as { username?: string }).username ?? "Someone";
          appendMessage({
            id: generateId(),
            username: "system",
            content: `${name} joined the room`,
            created_at: new Date().toISOString(),
            message_type: "system",
          });
        });
      },
    );

    channel.on(
      "presence",
      { event: "leave" },
      ({ leftPresences }) => {
        leftPresences.forEach((presence) => {
          const name =
            (presence as { username?: string }).username ?? "Someone";
          appendMessage({
            id: generateId(),
            username: "system",
            content: `${name} left the room`,
            created_at: new Date().toISOString(),
            message_type: "system",
          });
        });
      },
    );

    channel.subscribe(async (state) => {
      if (state === "SUBSCRIBED") {
        setStatus("live");
        await channel.track({ username });
      }
    });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [isRoomValid, normalizedRoomId, username]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !isRoomValid || !username) return;

    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    const message: ChatMessage = {
      id: generateId(),
      username,
      content: trimmed,
      created_at: new Date().toISOString(),
      message_type: "user",
    };

    appendMessage(message);
    await channelRef.current?.send({
      type: "broadcast",
      event: "message",
      payload: message,
    });
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-border bg-card/80 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted">
                Room Code
              </p>
              <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
                {displayRoomCode}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-xs uppercase tracking-[0.3em] text-accent">
                {status === "live" ? "Live" : "Connecting"}
              </span>
              <span className="rounded-full border border-border px-3 py-1 font-mono text-xs">
                {username || "User----"}
              </span>
              <ThemeToggle />
              <button
                type="button"
                onClick={() => router.push("/")}
                className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-foreground/40"
              >
                Leave Room
              </button>
            </div>
          </div>
          <p className="text-sm text-muted">
            Share this code to invite others. Messages only live while you are
            connected.
          </p>
        </header>

        <section className="flex min-h-[62vh] flex-1 min-h-0 flex-col rounded-3xl border border-border bg-card/60">
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 sm:px-6">
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
                  const isSystem = message.message_type === "system";
                  if (isSystem) {
                    return (
                      <div
                        key={message.id}
                        className="rounded-full border border-border bg-foreground/5 px-4 py-2 text-center text-xs text-muted"
                      >
                        {message.content}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={message.id}
                      className={`flex ${
                        isOwn ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-6 sm:max-w-[70%] ${
                          isOwn
                            ? "border-[#274769] bg-[#1b2d44] text-white"
                            : "border-accent/40 bg-accent/10 text-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 text-xs text-muted">
                          <span
                            className={`font-medium ${
                              isOwn ? "text-white/90" : "text-foreground"
                            }`}
                          >
                            {message.username}
                          </span>
                          <span className={isOwn ? "text-white/70" : ""}>
                            {formatTime(message.created_at)}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
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

          <div className="border-t border-border px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor="messageInput" className="sr-only">
                Message
              </label>
              <textarea
                id="messageInput"
                name="message"
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onInput={(event) => {
                  const target = event.currentTarget;
                  target.style.height = "auto";
                  target.style.height = `${target.scrollHeight}px`;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type a message..."
                rows={1}
                disabled={!isRoomValid || !username}
                className="flex-1 resize-none rounded-2xl border border-border bg-black/40 px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!isRoomValid || !username}
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
