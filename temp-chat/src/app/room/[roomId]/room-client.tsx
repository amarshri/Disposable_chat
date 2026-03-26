"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { normalizeRoomCode } from "@/lib/room";
import ThemeToggle from "@/components/theme-toggle";

type ChatMessage = {
  id: string;
  room_id: string;
  username: string;
  content: string;
  created_at: string;
  message_type?: "user" | "system";
};

type RoomClientProps = {
  roomId: string;
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
  const [roomExists, setRoomExists] = useState<boolean | null>(null);
  const [roomMode, setRoomMode] = useState<"anonymous" | "named" | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState("");
  const [usernameKey, setUsernameKey] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const joinedRef = useRef(false);
  const joinMessageSentRef = useRef(false);
  const leftMessageSentRef = useRef(false);
  const registeredRef = useRef(false);
  const clientIdRef = useRef("");

  useEffect(() => {
    // Use stored name only for room creators, not joiners.
    const mode = sessionStorage.getItem("chatMode") ?? "";
    const entryMode = sessionStorage.getItem("entryMode") ?? "";
    const savedName = sessionStorage.getItem("chatName") ?? "";
    if (entryMode === "create" && mode === "named" && savedName.trim()) {
      setUsername(savedName.trim());
    }
  }, []);

  useEffect(() => {
    const nav = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "reload" || nav?.type === "back_forward") {
      const entry = sessionStorage.getItem("room-entry");
      if (entry === normalizedRoomId) {
        sessionStorage.removeItem("room-entry");
        return;
      }
      const key = `room-refresh-${normalizedRoomId}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        router.replace("/");
      }
      return;
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        const entry = sessionStorage.getItem("room-entry");
        if (entry === normalizedRoomId) {
          sessionStorage.removeItem("room-entry");
          return;
        }
        const key = `room-refresh-${normalizedRoomId}`;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          router.replace("/");
        }
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);

  useEffect(() => {
    if (!isRoomValid) {
      setRoomExists(false);
      return;
    }

    let active = true;
    const checkRoom = async () => {
      const { data } = await supabase
        .from("rooms")
        .select("room_code, chat_mode")
        .eq("room_code", normalizedRoomId)
        .maybeSingle();
      if (active) {
        setRoomExists(Boolean(data));
        setRoomMode((data?.chat_mode as "anonymous" | "named") ?? "anonymous");
      }
    };

    checkRoom();
    return () => {
      active = false;
    };
  }, [isRoomValid, normalizedRoomId]);

  useEffect(() => {
    if (roomExists !== true || !roomMode) return;

    if (roomMode === "named") {
      // If no name stored, we'll prompt in-room. Otherwise username already set.
      return;
    }

    if (!username) {
      setUsername(`User${Math.floor(1000 + Math.random() * 9000)}`);
    }
  }, [roomExists, roomMode, username]);

  const normalizeName = (value: string) =>
    value.trim().toLowerCase();

  const getClientId = () => {
    if (clientIdRef.current) return clientIdRef.current;
    const storageKey = `anon-${normalizedRoomId}`;
    let existing = sessionStorage.getItem(storageKey);
    if (!existing) {
      existing =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(storageKey, existing);
    }
    clientIdRef.current = existing;
    return existing;
  };

  const validateName = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return "Enter your name to join this room.";
    }
    if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
      return "Use only letters or numbers. No spaces or symbols.";
    }
    if (trimmed.length > 10) {
      return "Name must be 10 characters or less.";
    }
    return "";
  };

  const saveNameAndJoin = async () => {
    const trimmed = nameInput.trim();
    const error = validateName(trimmed);
    if (error) {
      setNameError(error);
      return;
    }
    const key = normalizeName(trimmed);
    const { error: insertError } = await supabase.from("room_users").insert({
      room_code: normalizedRoomId,
      username: trimmed,
      username_key: key,
    });
    if (insertError) {
      setNameError("Username taken. Try adding numbers.");
      return;
    }
    setNameError("");
    setUsername(trimmed);
    setUsernameKey(key);
    registeredRef.current = true;
    sessionStorage.setItem("chatMode", "named");
    sessionStorage.setItem("chatName", trimmed);
  };

  const registerUser = async () => {
    if (registeredRef.current || !username) return true;
    const key =
      roomMode === "named" ? normalizeName(username) : getClientId();
    const { error: insertError } = await supabase.from("room_users").insert({
      room_code: normalizedRoomId,
      username,
      username_key: key,
    });
    if (insertError) {
      if (roomMode === "named") {
        setNameError("Username taken. Try adding numbers.");
        setUsername("");
      }
      return false;
    }
    setUsernameKey(key);
    registeredRef.current = true;
    return true;
  };

  const sendSystemMessage = async (content: string) => {
    if (leftMessageSentRef.current && content.includes("left the room")) {
      return;
    }
    if (!content.trim()) return;
    const { error } = await supabase.from("messages").insert({
      room_id: normalizedRoomId,
      username: "system",
      content,
    });
    if (error) {
      return;
    }
    if (content.includes("left the room")) {
      leftMessageSentRef.current = true;
    }
  };

  const cleanupIfEmpty = async () => {
    await supabase.rpc("cleanup_room_if_empty", { p_room: normalizedRoomId });
  };

  useEffect(() => {
    if (!isRoomValid || roomExists !== true || !username) {
      return;
    }

    let mounted = true;
    const initRoom = async () => {
      const ok = await registerUser();
      if (!ok) return;

      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", normalizedRoomId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (mounted && data) {
        setMessages(data as ChatMessage[]);
      }

      joinedRef.current = true;

      if (!joinMessageSentRef.current) {
        await sendSystemMessage(`${username} joined the room`);
        joinMessageSentRef.current = true;
      }
    };

    initRoom();

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

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      if (joinedRef.current) {
        sendSystemMessage(`${username} left the room`);
        if (usernameKey) {
          supabase
            .from("room_users")
            .delete()
            .eq("room_code", normalizedRoomId)
            .eq("username_key", usernameKey);
        }
        cleanupIfEmpty();
      }
      joinedRef.current = false;
    };
  }, [isRoomValid, normalizedRoomId, roomExists, roomMode, username]);

  useEffect(() => {
    if (!isRoomValid || roomExists !== true || !username) {
      return;
    }

    const handlePageHide = () => {
      if (!joinedRef.current) return;
      sendSystemMessage(`${username} left the room`);
      if (usernameKey) {
        const deleteUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/room_users?room_code=eq.${normalizedRoomId}&username_key=eq.${usernameKey}`;
        fetch(deleteUrl, {
          method: "DELETE",
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
            Prefer: "return=minimal",
          },
          keepalive: true,
        });
      }
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/cleanup_room_if_empty`, {
        method: "POST",
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_room: normalizedRoomId }),
        keepalive: true,
      });
      joinedRef.current = false;
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [isRoomValid, normalizedRoomId, roomExists, username, usernameKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !isRoomValid || !username || roomExists !== true) return;

    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    const { error } = await supabase.from("messages").insert({
      room_id: normalizedRoomId,
      username,
      content: trimmed,
    });
    if (error) {
      return;
    }
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
                {roomExists === false ? "Invalid room" : normalizedRoomId}
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
                onClick={() => {
                  if (joinedRef.current) {
                    sendSystemMessage(`${username} left the room`);
                    if (usernameKey) {
                      supabase
                        .from("room_users")
                        .delete()
                        .eq("room_code", normalizedRoomId)
                        .eq("username_key", usernameKey);
                    }
                    cleanupIfEmpty();
                  }
                  router.push("/");
                }}
                className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-foreground/40"
              >
                Leave Room
              </button>
            </div>
          </div>
          <p className="text-sm text-muted">
            Share this code to invite others. Messages persist while at least
            one user is connected.
          </p>
        </header>

        <section className="flex min-h-[60vh] flex-1 min-h-0 flex-col rounded-3xl border border-border bg-card/60">
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
            {roomExists === true && roomMode === "named" && !username && (
              <div className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-border bg-black/30 p-4 text-sm">
                <p className="text-foreground">
                  This is a named room. Enter your name to join.
                </p>
                <input
                  id="roomName"
                  name="roomName"
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  placeholder="Your name"
                  maxLength={10}
                  inputMode="text"
                  className="rounded-xl border border-border bg-black/40 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
                {nameError && (
                  <p className="text-xs text-red-400">{nameError}</p>
                )}
                <button
                  type="button"
                  onClick={saveNameAndJoin}
                  className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground"
                >
                  Join Room
                </button>
              </div>
            )}
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                {roomExists === false
                  ? "This room code is not valid. Go back and try again."
                  : "No messages yet. Say hello to get things going."}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((message) => {
                  const isOwn = message.username === username;
                  const isSystem =
                    message.message_type === "system" ||
                    message.username === "system";
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
                        className={`max-w-[75%] rounded-2xl border px-4 py-3 text-sm leading-6 ${
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

          <div className="border-t border-border px-6 py-4">
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
                disabled={!isRoomValid || !username || roomExists !== true}
                className="flex-1 resize-none rounded-2xl border border-border bg-black/40 px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!isRoomValid || !username || roomExists !== true}
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
