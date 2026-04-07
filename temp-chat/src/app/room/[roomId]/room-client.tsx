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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMessages, setShowNewMessages] = useState(false);
  const [showTopBar, setShowTopBar] = useState(true);

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
    if (messages.length === 0) {
      setShowNewMessages(false);
      return;
    }
    if (!scrollRef.current) return;
    if (isAtBottom) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
      setShowNewMessages(false);
    } else {
      setShowNewMessages(true);
    }
  }, [messages, isAtBottom]);

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

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsAtBottom(nearBottom);
    if (nearBottom) {
      setShowNewMessages(false);
    }
    const last = lastScrollTopRef.current;
    if (el.scrollTop < last - 6) {
      setShowTopBar(true);
    } else if (el.scrollTop > last + 6) {
      setShowTopBar(false);
    }
    lastScrollTopRef.current = el.scrollTop;
  };

  const scrollToBottom = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
    setShowNewMessages(false);
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        className={`pointer-events-none fixed top-4 left-0 right-0 z-20 px-4 transition-all duration-300 md:top-6 md:left-1/2 md:right-auto md:w-[min(90vw,900px)] md:-translate-x-1/2 ${
          showTopBar ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
        }`}
      >
        <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 rounded-full bg-[#0b2545]/90 px-4 py-2 text-xs text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur">
          <div className="flex items-center gap-2 font-mono uppercase tracking-[0.25em]">
            <span className="rounded-full bg-white/10 px-3 py-1">
              {roomExists === false ? "Invalid room" : normalizedRoomId}
            </span>
            <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-emerald-100">
              {status === "live" ? "Live" : "Connecting"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white/10 px-3 py-1 text-[11px]">
              {username || "User----"}
            </span>
            <ThemeToggle />
            <button
              type="button"
              onClick={async () => {
                await deleteUserNow();
                router.push("/");
              }}
              className="rounded-full bg-white px-4 py-1 text-[11px] font-semibold text-[#0b2545]"
            >
              Leave Room
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-full flex-col md:max-w-[900px]">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 pb-24 pt-24 md:px-6"
        >
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
            <div className="flex flex-col gap-3 md:gap-4">
              {messages.map((message) => {
                const isOwn = message.username === username;
                const isSystem =
                  message.message_type === "system" ||
                  message.username === "system";
                if (isSystem) {
                  return (
                    <div
                      key={message.id}
                      className="mx-auto rounded-full bg-foreground/10 px-4 py-2 text-center text-[11px] text-muted"
                    >
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
                      className={`relative max-w-[70%] rounded-[18px] px-4 py-2 text-sm leading-6 ${
                        isOwn
                          ? "bg-gradient-to-br from-[#4a6bff] via-[#6a5cff] to-[#8c4dff] text-white after:absolute after:bottom-1 after:right-[-6px] after:h-3 after:w-3 after:rotate-45 after:rounded-[2px] after:bg-[#6a5cff]"
                          : "bg-slate-200 text-slate-900 after:absolute after:bottom-1 after:left-[-6px] after:h-3 after:w-3 after:rotate-45 after:rounded-[2px] after:bg-slate-200 dark:bg-slate-700 dark:text-white dark:after:bg-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-[11px] text-black/60 dark:text-white/70">
                        <span
                          className={`font-medium ${
                            isOwn ? "text-white/90" : "text-slate-700 dark:text-white/80"
                          }`}
                        >
                          {message.username}
                        </span>
                        <span className={isOwn ? "text-white/70" : ""}>
                          {formatTime(message.created_at)}
                        </span>
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
      </div>

      {showNewMessages && (
        <div className="fixed bottom-24 left-0 right-0 z-20 flex justify-center">
          <button
            type="button"
            onClick={scrollToBottom}
            className="rounded-full bg-[#0b2545] px-4 py-2 text-xs font-semibold text-white shadow-md"
          >
            New Messages ↓
          </button>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-20 px-4 pb-4 pt-2">
        <div className="mx-auto flex w-full max-w-full items-center gap-3 rounded-full bg-white/90 px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur dark:bg-[#0f172a]/90 md:max-w-[900px]">
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
            placeholder="Type a message..."
            rows={1}
            disabled={!isRoomValid || !username || roomExists !== true}
            className="max-h-28 flex-1 resize-none rounded-full border border-transparent bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!isRoomValid || !username || roomExists !== true}
            className="rounded-full bg-[#0b2545] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#14345f] disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
