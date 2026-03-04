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

function extractName(text: string): string | undefined {
  const m = text.match(/jag heter ([a-zåäö]+)/i);
  return m?.[1]
    ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()
    : undefined;
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

  /* load saved chat */
  useEffect(() => {
    if (!mounted) return;

    try {
      const p = JSON.parse(localStorage.getItem(STORAGE_PROFILE) || "{}");
      const m = JSON.parse(localStorage.getItem(STORAGE_MSGS) || "[]");

      setProfile(p);

      if (m.length) {
        setMessages(m.map((x: StoredMsg) => ({ ...x, display: x.content })));
      } else {
        setMessages([
          {
            id: uid(),
            role: "assistant",
            content: "Hej, jag är Ugglan Ollie 🦉\nVad heter du?",
            display: "Hej, jag är Ugglan Ollie 🦉\nVad heter du?",
          },
        ]);
      }
    } catch {}
  }, [mounted]);

  /* save chat */
  useEffect(() => {
    if (!mounted) return;

    localStorage.setItem(
      STORAGE_MSGS,
      JSON.stringify(messages.map((m) => ({ id: m.id, role: m.role, content: m.content })))
    );
  }, [messages, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_PROFILE, JSON.stringify(profile));
  }, [profile, mounted]);

  /* scroll */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  /* typewriter animation */
  useEffect(() => {
    if (typeTimerRef.current) clearInterval(typeTimerRef.current);

    const idx = [...messages].reverse().findIndex((m) => m.animate);
    if (idx === -1) return;

    const real = messages.length - 1 - idx;
    const msg = messages[real];

    let pos = 0;

    typeTimerRef.current = window.setInterval(() => {
      pos++;

      setMessages((prev) => {
        const copy = [...prev];
        const cur = copy[real];

        if (!cur) return prev;

        copy[real] = {
          ...cur,
          display: cur.content.slice(0, pos),
          animate: pos < cur.content.length,
        };

        return copy;
      });

      if (pos >= msg.content.length && typeTimerRef.current) {
        clearInterval(typeTimerRef.current);
      }
    }, 15);
  }, [messages]);

  async function send() {
    if (!input.trim()) return;

    const text = input.trim();

    const userMsg: UiMsg = {
      id: uid(),
      role: "user",
      content: text,
      display: text,
    };

    const newMessages = [...messages, userMsg];

    const maybeName = extractName(text);
    if (maybeName && !profile.name) {
      setProfile((p) => ({ ...p, name: maybeName }));
    }

    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          memory: profileRef.current.memoryNote || "",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: data.text,
          display: "",
          animate: true,
        },
      ]);

      if (data.memory) {
        setProfile((p) => ({ ...p, memoryNote: data.memory }));
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: "Oj! Något gick snett.",
          display: "Oj! Något gick snett.",
        },
      ]);
    }

    setLoading(false);
  }

  function newChat() {
    localStorage.removeItem(STORAGE_MSGS);

    setMessages([
      {
        id: uid(),
        role: "assistant",
        content: "Hej igen! Vad vill du prata om?",
        display: "Hej igen! Vad vill du prata om?",
      },
    ]);
  }

  function forget() {
    localStorage.removeItem(STORAGE_MSGS);
    localStorage.removeItem(STORAGE_PROFILE);

    setProfile({});
    setMessages([
      {
        id: uid(),
        role: "assistant",
        content: "Hej! Jag är Ugglan Ollie 🦉\nVad heter du?",
        display: "Hej! Jag är Ugglan Ollie 🦉\nVad heter du?",
      },
    ]);
  }

  if (!mounted) return null;

  const disabled = !input.trim() || loading;

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
      {/* header */}
      <div
        style={{
          padding: 12,
          background: "white",
          borderBottom: "1px solid #ddd",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          onClick={forget}
          style={{
            background: "#1c1c1e",
            color: "white",
            border: "none",
            borderRadius: 12,
            padding: "8px 14px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Glöm mig
        </button>

        <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/ollie.png" style={{ width: 28 }} />
          Ugglan Ollie
        </div>

        <button
          onClick={newChat}
          style={{
            background: "#1c1c1e",
            color: "white",
            border: "none",
            borderRadius: 12,
            padding: "8px 14px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Ny chatt
        </button>
      </div>

      {/* messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                background: m.role === "user" ? "#007aff" : "#e5e5ea",
                color: m.role === "user" ? "white" : "black",
                padding: "12px 16px",
                borderRadius: 20,
                maxWidth: "75%",
                whiteSpace: "pre-wrap",
                fontSize: 16,
              }}
            >
              {m.display ?? m.content}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div
        style={{
          padding: 12,
          borderTop: "1px solid #ddd",
          background: "white",
          display: "flex",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Skriv ett meddelande..."
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 20,
            border: "1px solid #ccc",
            fontSize: 16,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />

        <button
          onClick={send}
          disabled={disabled}
          style={{
            marginLeft: 8,
            padding: "12px 20px",
            borderRadius: 20,
            border: "none",
            background: disabled ? "#bcdcff" : "#007aff",
            color: "white",
            fontWeight: 800,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          Skicka
        </button>
      </div>
    </main>
  );
}