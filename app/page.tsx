"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";
type StoredMsg = { id: string; role: Role; content: string };
type UiMsg = StoredMsg & { display?: string; animate?: boolean };

type Profile = {
  name?: string;
  lastTopic?: string; // sparas internt men visas inte
  memoryNote?: string;
  updatedAt?: number;
};

const STORAGE_MSGS = "ollie_chat_v6_messages";
const STORAGE_PROFILE = "ollie_chat_v6_profile";

const RETURN_GREETING_GAP_MS = 60 * 60 * 1000; // 1 timme

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

function pickTopic(text: string): string | undefined {
  const t = text.trim();
  if (t.length < 8) return undefined;

  const low = t.toLowerCase();
  const junk = new Set(["ja", "nej", "japp", "nä", "ok", "okej", "mm", "m", "aha", "k", "yes", "no", "bra", "tack"]);
  const lowCompact = low.replace(/[!?.,:;()\[\]'"”“]/g, "").trim();
  if (junk.has(lowCompact)) return undefined;
  if (/^\s*(jag\s+heter|mitt\s+namn\s+är|jag\s+kallas)\b/i.test(t)) return undefined;

  const firstSentence = t.split(/\n|[.!?]/)[0].trim().replace(/\s+/g, " ");
  if (firstSentence.length < 8) return undefined;
  return firstSentence.length > 40 ? firstSentence.slice(0, 40) + "…" : firstSentence;
}

function isReturning(p?: Profile) {
  if (!p?.updatedAt) return false;
  return Date.now() - p.updatedAt >= RETURN_GREETING_GAP_MS;
}

function firstAssistantMessage(p?: Profile) {
  if (p?.name) {
    const returning = isReturning(p);
    const line1 = returning ? `Hej ${p.name}! Kul att se dig igen 🦉` : `Hej ${p.name}! 🦉`;
    return `${line1}\nVad vill du prata om idag?`;
  }
  return "Hej, jag är Ugglan Ollie 🦉\nVad heter du?";
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

  // Load
  useEffect(() => {
    if (!mounted) return;

    let p: Profile = {};
    try {
      const rawP = localStorage.getItem(STORAGE_PROFILE);
      if (rawP) p = JSON.parse(rawP);
    } catch {}

    let stored: StoredMsg[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_MSGS);
      if (raw) stored = JSON.parse(raw);
    } catch {}

    setProfile(p);

    if (Array.isArray(stored) && stored.length > 0) {
      setMessages(stored.map((m) => ({ ...m, display: m.content, animate: false })));
    } else {
      const text = firstAssistantMessage(p);
      setMessages([{ id: uid(), role: "assistant", content: text, display: text, animate: false }]);
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

  // Scroll
  useEffect(() => {
    if (!mounted) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mounted, messages, loading]);

  // Typewriter
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

      if (pos >= full.length && typeTimerRef.current) {
        window.clearInterval(typeTimerRef.current);
        typeTimerRef.current = null;
      }
    }, 16);

    return () => {
      if (typeTimerRef.current) {
        window.clearInterval(typeTimerRef.current);
        typeTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, messages]);

  const displayName = useMemo(() => profile.name, [profile.name]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const animating = messages.some((m) => m.role === "assistant" && m.animate);
    if (animating) return;

    const now = Date.now();

    const userMsg: UiMsg = { id: uid(), role: "user", content: text, display: text, animate: false };
    const newMessages = [...messages, userMsg];

    // Name
    const maybeName = extractName(text);
    if (maybeName && !profileRef.current.name) {
      setProfile((p) => ({ ...p, name: maybeName, updatedAt: now }));
    } else {
      setProfile((p) => ({ ...p, updatedAt: now }));
    }

    // Topic (internal only)
    const topic = pickTopic(text);
    if (topic) setProfile((p) => ({ ...p, lastTopic: topic, updatedAt: now }));

    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const payload = newMessages.map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: payload,
          memory: profileRef.current.memoryNote || "",
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!res.ok) throw new Error((await res.text()).slice(0, 240));
      if (!contentType.includes("application/json")) {
        const t = await res.text();
        throw new Error("API svarade inte med JSON. Första raden: " + t.split("\n")[0]);
      }

      const data = await res.json();
      const fullText = (data.text || "(tomt svar)") as string;

      if (typeof data.memory === "string") {
        setProfile((p) => ({ ...p, memoryNote: data.memory, updatedAt: Date.now() }));
      }

      setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: fullText, display: "", animate: true }]);
    } catch (e: any) {
      const msg = `Oj! Något gick snett: ${e?.message ?? "okänt fel"}`;
      setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: msg, display: msg, animate: false }]);
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    const p = profileRef.current;
    const text = firstAssistantMessage(p);

    try {
      localStorage.removeItem(STORAGE_MSGS);
    } catch {}

    setMessages([{ id: uid(), role: "assistant", content: text, display: text, animate: false }]);
    setInput("");
    setLoading(false);
  }

  function forgetMe() {
    // Rensa allt personligt + historik
    try {
      localStorage.removeItem(STORAGE_MSGS);
      localStorage.removeItem(STORAGE_PROFILE);
    } catch {}

    const cleanProfile: Profile = {};
    setProfile(cleanProfile);

    const text = firstAssistantMessage(cleanProfile);
    setMessages([{ id: uid(), role: "assistant", content: text, display: text, animate: false }]);

    setInput("");
    setLoading(false);
  }

  if (!mounted) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui", background: "#f2f2f7" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #ddd", background: "white", textAlign: "center", fontWeight: 700 }}>🦉 Ugglan Ollie</div>
        <div style={{ padding: 16, color: "#666" }}>Laddar…</div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui", background: "#f2f2f7" }}>
      <style>{`
        .ollieAvatar { width: 34px; height: 34px; border-radius: 999px; object-fit: cover; box-shadow: 0 2px 10px rgba(0,0,0,0.12); animation: ollieFloat 3.2s ease-in-out infinite; }
        .ollieAvatarSmall { width: 26px; height: 26px; border-radius: 999px; object-fit: cover; box-shadow: 0 2px 8px rgba(0,0,0,0.10); animation: ollieFloat 3.2s ease-in-out infinite; }
        @keyframes ollieFloat { 0% { transform: translateY(0px); } 50% { transform: translateY(-3px); } 100% { transform: translateY(0px); } }
        .typingDots { display: inline-flex; gap: 6px; align-items: center; justify-content: center; min-width: 44px; }
        .typingDots span { width: 7px; height: 7px; border-radius: 999px; background: #7a7a7a; display: inline-block; animation: dotPulse 1s infinite; }
        .typingDots span:nth-child(2) { animation-delay: 0.15s; }
        .typingDots span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes dotPulse { 0% { transform: translateY(0); opacity: .45; } 30% { transform: translateY(-4px); opacity: 1; } 60% { transform: translateY(0); opacity: .6; } 100% { transform: translateY(0); opacity: .45; } }
      `}</style>

      {/* header */}
      <div style={{ padding: 12, borderBottom: "1px solid #ddd", background: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          onClick={forgetMe}
          style={{
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid #ccc",
            background: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
          title="Rensar namn och minne"
        >
          Glöm mig
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800 }}>
          <img src="/ollie.png" className="ollieAvatar" alt="Ollie" />
          <div>
            <div>Ugglan Ollie</div>
            {displayName && <div style={{ fontSize: 12, fontWeight: 600, color: "#666" }}>Hej, {displayName}!</div>}
          </div>
        </div>

        <button
          onClick={newChat}
          style={{
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid #ccc",
            background: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Ny chatt
        </button>
      </div>

      {/* chat */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m) => {
          const isUser = m.role === "user";
          const shown = isUser ? m.content : (m.display ?? m.content);
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 8 }}>
              {!isUser && <img src="/ollie.png" className="ollieAvatarSmall" alt="Ollie" />}
              <div style={{ maxWidth: "75%", padding: "12px 16px", borderRadius: 20, fontSize: 16, lineHeight: 1.4, whiteSpace: "pre-wrap", background: isUser ? "#0b93f6" : "#e5e5ea", color: isUser ? "white" : "black" }}>
                {shown}
              </div>
            </div>
          );
        })}

        {loading && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <img src="/ollie.png" className="ollieAvatarSmall" alt="Ollie" />
            <div style={{ background: "#e5e5ea", borderRadius: 20, padding: "10px 14px", display: "inline-flex" }}>
              <div className="typingDots"><span /><span /><span /></div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div style={{ display: "flex", padding: 12, borderTop: "1px solid #ddd", background: "white" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Skriv ett meddelande…"
          style={{ flex: 1, padding: 12, borderRadius: 20, border: "1px solid #ccc", fontSize: 16, outline: "none" }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading || messages.some((m) => m.role === "assistant" && m.animate)}
          style={{
            marginLeft: 8,
            padding: "12px 18px",
            borderRadius: 20,
            border: "none",
            background: !input.trim() || loading || messages.some((m) => m.role === "assistant" && m.animate) ? "#cfe6fb" : "#0b93f6",
            color: "white",
            fontWeight: 800,
            cursor: !input.trim() || loading || messages.some((m) => m.role === "assistant" && m.animate) ? "not-allowed" : "pointer",
          }}
        >
          Skicka
        </button>
      </div>
    </main>
  );
}