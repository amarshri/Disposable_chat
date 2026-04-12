"use client";

import { useEffect, useRef, useState } from "react";
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
  const HEARTBEAT_MS = 35000;

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
  const joinMessageSentRef = useRef(false);
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
    const { error: insertError } = await supabase
      .from("room_users")
      .insert({
        room_code: normalizedRoomId,
        username: trimmed,
        username_key: key,
        last_seen: new Date().toISOString(),
      });
    if (insertError) {
      setNameError("Username taken. Try adding numbers.");
      return;
    }
    setNameError("");
    setUsername(trimmed);
    setUsernameKey(key);
    sessionStorage.setItem("chatMode", "named");
    sessionStorage.setItem("chatName", trimmed);
  };

  const registerUser = async () => {
    if (usernameKey || !username) return true;
    const isNamed = roomMode === "named";
    const key = isNamed ? normalizeName(username) : getClientId();
    const insertPayload = {
      room_code: normalizedRoomId,
      username,
      username_key: key,
      last_seen: new Date().toISOString(),
    };
    const insertResult = isNamed
      ? await supabase.from("room_users").insert(insertPayload)
      : await supabase
          .from("room_users")
          .upsert(insertPayload, { onConflict: "room_code,username_key" });
    const insertError = insertResult.error;
    if (insertError) {
      if (isNamed) {
        setNameError("Username taken. Try adding numbers.");
        setUsername("");
      }
      return false;
    }
    setUsernameKey(key);
    return true;
  };

  const updateLastSeen = async () => {
    if (!usernameKey) return;
    await supabase
      .from("room_users")
      .update({ last_seen: new Date().toISOString() })
      .eq("room_code", normalizedRoomId)
      .eq("username_key", usernameKey);
  };

  const deleteUserNow = async () => {
    if (!usernameKey) return;
    await supabase.rpc("leave_room_atomic", {
      p_room: normalizedRoomId,
      p_username_key: usernameKey,
    });
  };

  const sendSystemMessage = async (content: string) => {
    if (!content.trim()) return;
    const { error } = await supabase.from("messages").insert({
      room_id: normalizedRoomId,
      username: "system",
      content,
    });
    if (error) {
      return;
    }
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
    };
  }, [isRoomValid, normalizedRoomId, roomExists, roomMode, username]);

  useEffect(() => {
    if (!isRoomValid || roomExists !== true || !username || !usernameKey) {
      return;
    }

    const heartbeat = async () => {
      await updateLastSeen();
      const { data: roomCheck } = await supabase
        .from("rooms")
        .select("room_code")
        .eq("room_code", normalizedRoomId)
        .maybeSingle();
      if (!roomCheck) {
        setRoomExists(false);
      }
    };

    heartbeat();
    const interval = setInterval(heartbeat, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [
    isRoomValid,
    roomExists,
    normalizedRoomId,
    username,
    usernameKey,
    HEARTBEAT_MS,
  ]);

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
    await updateLastSeen();
    const { error } = await supabase.from("messages").insert({
      room_id: normalizedRoomId,
      username,
      content: trimmed,
    });
    if (error) {
      const { data: roomCheck } = await supabase
        .from("rooms")
        .select("room_code")
        .eq("room_code", normalizedRoomId)
        .maybeSingle();
      if (!roomCheck) {
        setRoomExists(false);
      }
      return;
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="min-h-screen bg-[var(--chat-page)] text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[900px] flex-col px-4 pb-6 pt-6 sm:px-6">
        <header className="mb-4 rounded-3xl bg-[var(--chat-card)] px-5 py-4 shadow-[var(--chat-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-muted">
                Room Code
              </p>
              <h1 className="text-xl font-semibold text-foreground">
                {roomExists === false ? "Invalid room" : normalizedRoomId}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-full bg-[var(--chat-live-bg)] px-3 py-1 font-semibold text-[var(--chat-live-text)]">
                {status === "live" ? "Live" : "Connecting"}
              </span>
              <span className="rounded-full bg-[var(--chat-pill)] px-3 py-1 font-medium text-[var(--chat-pill-text)]">
                {username || "User----"}
              </span>
              <ThemeToggle />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={async () => {
                await deleteUserNow();
                router.push("/");
              }}
              className="rounded-full bg-[var(--chat-leave-bg)] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[var(--chat-leave-hover)]"
            >
              Leave Room
            </button>
            <p className="text-xs text-muted">
              Messages persist while at least one user is connected.
            </p>
          </div>
        </header>

        <section className="flex flex-1 flex-col rounded-3xl bg-[var(--chat-card)] px-4 pb-4 pt-3 shadow-[var(--chat-shadow)]">
          <div className="flex-1 overflow-y-auto px-2 pb-2 pt-1 sm:px-3">
            {roomExists === true && roomMode === "named" && !username && (
              <div className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-border bg-white/80 p-4 text-sm shadow-sm dark:border-[#283350] dark:bg-[#0f172a]">
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
                  className="rounded-xl border border-[#d7e2f1] bg-[#f7f9ff] px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-[#6aa2ff] focus:outline-none dark:border-[#2b3753] dark:bg-[#0f172a]"
                />
                {nameError && (
                  <p className="text-xs text-red-400">{nameError}</p>
                )}
                <button
                  type="button"
                  onClick={saveNameAndJoin}
                  className="rounded-xl bg-[#6aa2ff] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white"
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
              <div className="flex flex-col gap-3 pb-2">
                {messages.map((message) => {
                  const isOwn = message.username === username;
                  const isSystem =
                    message.message_type === "system" ||
                    message.username === "system";
                  if (isSystem) {
                    return (
                      <div
                        key={message.id}
                        className="mx-auto inline-flex items-center gap-2 rounded-full bg-[var(--chat-system-bg)] px-3 py-1 text-[11px] text-[var(--chat-system-text)]"
                      >
                        <span className="h-2 w-2 rounded-full bg-[#6aa2ff]" />
                        {message.content}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-[18px] px-3 py-2 text-sm leading-6 ${
                          isOwn
                            ? "bg-[var(--chat-sent-bg)] text-white"
                            : "bg-[var(--chat-received-bg)] text-[var(--chat-received-text)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 text-[10px] text-[#6c7a92] dark:text-[#9aa7bd]">
                          <span className="font-medium">
                            {message.username}
                          </span>
                          <span>{formatTime(message.created_at)}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
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

          <div className="mt-2 flex items-center gap-2 rounded-2xl border border-[var(--chat-input-border)] bg-[var(--chat-input-bg)] px-3 py-2">
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
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type message..."
              rows={1}
              disabled={!isRoomValid || !username || roomExists !== true}
              className="flex-1 resize-none rounded-xl bg-transparent px-2 py-2 text-sm text-foreground placeholder:text-[var(--chat-input-placeholder)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!isRoomValid || !username || roomExists !== true}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--chat-send-bg)] text-white shadow-sm transition hover:bg-[var(--chat-send-hover)] disabled:opacity-50"
              aria-label="Send message"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
