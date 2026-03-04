"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";
type StoredMsg = { id: string; role: Role; content: string };
type UiMsg = StoredMsg & { display?: string; animate?: boolean };

type Profile = {
  name?: string;
  memoryNote?: string;
  updatedAt?: number;
};

const STORAGE_MSGS = "ollie_messages";
const STORAGE_PROFILE = "ollie_profile";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function extractName(text: string): string | undefined {
  const t = text.trim();
  let m = t.match(/^\s*jag\s+heter\s+([A-Za-zÅÄÖåäö\-']{2,})/i);
  if (m?.[1]) return cap(m[1]);
  m = t.match(/^\s*mitt\s+namn\s+är\s+([A-Za-zÅÄÖåäö\-']{2,})/i);
  if (m?.[1]) return cap(m[1]);
  m = t.match(/^\s*jag\s+kallas\s+([A-Za-zÅÄÖåäö\-']{2,})/i);
  if (m?.[1]) return cap(m[1]);
  return undefined;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);

  const [profile, setProfile] = useState<Profile>({});
  const profileRef = useRef<Profile>({});

  const [messages, setMessages] = useState<UiMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const typeTimerRef = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Load from localStorage
  useEffect(() => {
    if (!mounted) return;

    let p: Profile = {};
    let stored: StoredMsg[] = [];
    try {
      p = JSON.parse(localStorage.getItem(STORAGE_PROFILE) || "{}");
    } catch {}
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_MSGS) || "[]");
    } catch {}

    setProfile(p);

    if (Array.isArray(stored) && stored.length > 0) {
      setMessages(stored.map((m) => ({ ...m, display: m.content, animate: false })));
    } else {
      const first = p?.name
        ? `Hej ${p.name}! 🦉\nVad vill du prata om idag?`
        : "Hej, jag är Ugglan Ollie 🦉\nVad heter du?";
      setMessages([{ id: uid(), role: "assistant", content: first, display: first }]);
    }
  }, [mounted]);

  // Persist messages
  useEffect(() => {
    if (!mounted) return;
    try {
      const stored: StoredMsg[] = messages.map((m) => ({ id: m.id, role: m.role, content: m.content }));
      localStorage.setItem(STORAGE_MSGS, JSON.stringify(stored));
    } catch {}
  }, [mounted, messages]);

  // Persist profile
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_PROFILE, JSON.stringify(profile));
    } catch {}
  }, [mounted, profile]);

  // Auto-scroll
  useEffect(() => {
    if (!mounted) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mounted, messages, loading]);

  // Typewriter for latest assistant message marked animate=true
  useEffect(() => {
    if (!mounted) return;

    if (typeTimerRef.current) {
      window.clearInterval(typeTimerRef.current);
      typeTimerRef.current = null;
    }

    const idx = [...messages].reverse().findIndex((m) => m.role === "assistant" && m.animate);
    if (idx === -1) return;

    const realIndex = messages.length - 1 - idx;
    const msg = messages[realIndex];
    const full = msg.content;
    let pos = (msg.display ?? "").length;

    typeTimerRef.current = window.setInterval(() => {
      pos = Math.min(pos + 1, full.length);
      const nextDisplay = full.slice(0, pos);

      setMessages((prev) => {
        const copy = [...prev];
        const cur = copy[realIndex];
        if (!cur) return prev;
        copy[realIndex] = { ...cur, display: nextDisplay, animate: pos < full.length };
        return copy;
      });

      if (pos >= full.length) {
        if (typeTimerRef.current) {
          window.clearInterval(typeTimerRef.current);
          typeTimerRef.current = null;
        }
      }
    }, 14);

    return () => {
      if (typeTimerRef.current) {
        window.clearInterval(typeTimerRef.current);
        typeTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, messages]);

  const title = useMemo(() => "Ugglan Ollie", []);

  const animating = messages.some((m) => m.role === "assistant" && m.animate);
  const sendDisabled = !input.trim() || loading || animating;

  async function send() {
    const text = input.trim();
    if (!text || sendDisabled) return;

    const now = Date.now();

    // local name capture for UI memory
    const maybeName = extractName(text);
    if (maybeName && !profileRef.current.name) {
      setProfile((p) => ({ ...p, name: maybeName, updatedAt: now }));
    } else {
      setProfile((p) => ({ ...p, updatedAt: now }));
    }

    const userMsg: UiMsg = { id: uid(), role: "user", content: text, display: text, animate: false };
    const newMessages = [...messages, userMsg];

    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          memory: profileRef.current.memoryNote || "",
        }),
      });

      const data = await res.json();
      const replyText = (data.text || "(tomt svar)") as string;

      if (typeof data.memory === "string") {
        setProfile((p) => ({ ...p, memoryNote: data.memory, updatedAt: Date.now() }));
      }

      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: replyText, display: "", animate: true },
      ]);
    } catch (e: any) {
      const msg = `Oj! Något gick snett: ${e?.message ?? "okänt fel"}`;
      setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: msg, display: msg }]);
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    try {
      localStorage.removeItem(STORAGE_MSGS);
    } catch {}

    const p = profileRef.current;
    const first = p?.name
      ? `Hej ${p.name}! 🦉\nVad vill du prata om idag?`
      : "Hej, jag är Ugglan Ollie 🦉\nVad heter du?";
    setMessages([{ id: uid(), role: "assistant", content: first, display: first }]);
    setInput("");
    setLoading(false);
  }

  function forgetMe() {
    try {
      localStorage.removeItem(STORAGE_MSGS);
      localStorage.removeItem(STORAGE_PROFILE);
    } catch {}

    setProfile({});
    const first = "Hej, jag är Ugglan Ollie 🦉\nVad heter du?";
    setMessages([{ id: uid(), role: "assistant", content: first, display: first }]);
    setInput("");
    setLoading(false);
  }

  if (!mounted) return null;

  return (
    <main
      style={{
        maxWidth: 600,
        margin: "0 auto",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f2f2f7",
        fontFamily: "system-ui",
      }}
    >
      <style>{`
        .iosHeader {
          height: 54px;
          background: rgba(255,255,255,0.92);
          backdrop-filter: saturate(180%) blur(16px);
          -webkit-backdrop-filter: saturate(180%) blur(16px);
          border-bottom: 1px solid rgba(60,60,67,0.12);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 12px;
        }
        .iosHeaderBtn {
          appearance: none;
          background: transparent;
          border: none;
          padding: 8px 10px;
          font-size: 16px;
          font-weight: 700;
          color: #007AFF;
          cursor: pointer;
        }
        .iosHeaderBtn:active { opacity: 0.55; }
        .centerTitle {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 800;
          color: #111;
        }
        .centerTitle img {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          object-fit: cover;
          box-shadow: 0 2px 8px rgba(0,0,0,0.10);
          animation: ollieFloat 3.2s ease-in-out infinite;
        }
        @keyframes ollieFloat { 0% { transform: translateY(0px); } 50% { transform: translateY(-2px); } 100% { transform: translateY(0px); } }

        .chatArea {
          flex: 1;
          overflow-y: auto;
          padding: 14px 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .row {
          display: flex;
          align-items: flex-end;
          gap: 8px;
        }
        .row.user { justify-content: flex-end; }
        .row.assistant { justify-content: flex-start; }

        .avatarSmall {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          object-fit: cover;
          box-shadow: 0 2px 8px rgba(0,0,0,0.10);
          animation: ollieFloat 3.2s ease-in-out infinite;
          flex: 0 0 auto;
        }

        .bubble {
          max-width: 76%;
          padding: 12px 14px;
          border-radius: 20px;
          font-size: 16px;
          line-height: 1.35;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .bubble.user {
          background: #007AFF;
          color: #fff;
          border-bottom-right-radius: 6px;
        }
        .bubble.assistant {
          background: #E5E5EA;
          color: #111;
          border-bottom-left-radius: 6px;
        }

        .composer {
          background: rgba(255,255,255,0.95);
          backdrop-filter: saturate(180%) blur(16px);
          -webkit-backdrop-filter: saturate(180%) blur(16px);
          border-top: 1px solid rgba(60,60,67,0.12);
          padding: 10px 10px calc(10px + env(safe-area-inset-bottom));
          display: flex;
          align-items: flex-end;
          gap: 10px;
        }

        /* ✅ FIX: input text was invisible */
        .textInput {
          flex: 1;
          border: 1px solid rgba(60,60,67,0.24);
          background: #fff;
          border-radius: 20px;
          padding: 10px 12px;
          font-size: 16px;
          outline: none;

          color: #111;
          caret-color: #007AFF;
          -webkit-text-fill-color: #111;
        }
        .textInput::placeholder {
          color: rgba(60,60,67,0.6);
        }

        .sendBtn {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: none;
          display: grid;
          place-items: center;
          font-size: 18px;
          font-weight: 900;
          color: #fff;
          background: #007AFF;
          cursor: pointer;
          box-shadow: 0 6px 16px rgba(0,122,255,0.25);
        }
        .sendBtn:disabled {
          background: #BBD9FF;
          box-shadow: none;
          cursor: not-allowed;
        }
        .sendBtn:active:not(:disabled) { transform: translateY(1px); opacity: 0.9; }

        .typingDots { display: inline-flex; gap: 6px; align-items: center; justify-content: center; min-width: 44px; }
        .typingDots span { width: 7px; height: 7px; border-radius: 999px; background: #7a7a7a; display: inline-block; animation: dotPulse 1s infinite; }
        .typingDots span:nth-child(2) { animation-delay: 0.15s; }
        .typingDots span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes dotPulse { 0% { transform: translateY(0); opacity: .45; } 30% { transform: translateY(-4px); opacity: 1; } 60% { transform: translateY(0); opacity: .6; } 100% { transform: translateY(0); opacity: .45; } }
      `}</style>

      {/* header */}
      <div className="iosHeader">
        <button className="iosHeaderBtn" onClick={forgetMe}>
          Glöm mig
        </button>

        <div className="centerTitle" aria-label={title}>
          <img src="/ollie.png" alt="Ollie" />
          <span>Ugglan Ollie</span>
        </div>

        <button className="iosHeaderBtn" onClick={newChat}>
          Ny chatt
        </button>
      </div>

      {/* chat */}
      <div className="chatArea">
        {messages.map((m) => {
          const isUser = m.role === "user";
          const shown = isUser ? m.content : m.display ?? m.content;
          return (
            <div key={m.id} className={`row ${isUser ? "user" : "assistant"}`}>
              {!isUser && <img className="avatarSmall" src="/ollie.png" alt="Ollie" />}
              <div className={`bubble ${isUser ? "user" : "assistant"}`}>{shown}</div>
            </div>
          );
        })}

        {loading && (
          <div className="row assistant">
            <img className="avatarSmall" src="/ollie.png" alt="Ollie" />
            <div className="bubble assistant" style={{ padding: "10px 12px" }}>
              <div className="typingDots">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* composer */}
      <div className="composer">
        <input
          className="textInput"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="iMessage…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="sendBtn" onClick={send} disabled={sendDisabled} aria-label="Skicka">
          ↑
        </button>
      </div>
    </main>
  );
}