import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/http.js";

function clamp(n, min, max) {
  const x = Number(n);
  if (Number.isNaN(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function normalizeTheme(theme) {
  const t = theme || {};
  return {
    title: String(t.title || "Chat"),
    launcherText: String(t.launcherText || "Chat"),
    primaryColor: String(t.primaryColor || "#0f172a"),
    accentColor: String(t.accentColor || "#38bdf8"),
    borderRadius: clamp(t.borderRadius ?? 18, 8, 28),
    position: t.position === "left" ? "left" : "right"
  };
}

function bubbleStyle(role, theme) {
  const isUser = role === "user";
  return {
    alignSelf: isUser ? "flex-end" : "flex-start",
    maxWidth: "88%",
    padding: "10px 12px",
    borderRadius: 14,
    background: isUser ? theme.primaryColor : "rgba(15, 23, 42, 0.06)",
    color: isUser ? "#fff" : "#0f172a",
    border: isUser ? "1px solid rgba(15, 23, 42, 0.14)" : "1px solid rgba(15, 23, 42, 0.08)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.35
  };
}

function normalizeLinks(links) {
  if (!Array.isArray(links)) return [];
  return links
    .map((l) => ({
      title: String(l?.title || l?.name || "Link"),
      url: String(l?.url || l?.href || "").trim()
    }))
    .filter((l) => l.url);
}

export default function ChatWidget({
  publicId,
  embedKey,
  height = "min(62vh, 640px)",
  initialGreeting = "Hi! How can I help?",
  themeOverride
}) {
  const [remoteConfig, setRemoteConfig] = useState(null);
  const [messages, setMessages] = useState([{ role: "assistant", content: initialGreeting, links: [] }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);

  const canChat = useMemo(() => Boolean(publicId && embedKey), [publicId, embedKey]);
  const theme = useMemo(
    () => normalizeTheme({ ...(remoteConfig?.agent?.theme || {}), ...(themeOverride || {}) }),
    [remoteConfig, themeOverride]
  );

  useEffect(() => {
    if (!canChat) return;
    api(`/api/widget/${encodeURIComponent(publicId)}/config`, {
      headers: { "x-embed-key": embedKey }
    })
      .then((cfg) => setRemoteConfig(cfg))
      .catch(() => null);
  }, [canChat, publicId, embedKey]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading || !canChat) return;

    setError("");
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text, links: [] }]);
    setLoading(true);
    try {
      const res = await api(`/api/widget/${encodeURIComponent(publicId)}/chat`, {
        method: "POST",
        headers: { "x-embed-key": embedKey },
        body: { message: text, history: messages.slice(-12) }
      });
      const reply = String(res?.reply || "").trim() || "Ok.";
      const links = normalizeLinks(res?.links || []);
      setMessages((prev) => [...prev, { role: "assistant", content: reply, links }]);
    } catch (err) {
      setError(err?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  const trial = remoteConfig?.trial || null;
  const trialNote = trial && typeof trial.remaining === "number" ? `Trial remaining: ${trial.remaining}` : null;

  return (
    <div
      style={{
        borderRadius: theme.borderRadius,
        overflow: "hidden",
        border: "1px solid rgba(15, 23, 42, 0.1)",
        background: "#fff",
        boxShadow: "0 22px 60px rgba(15, 23, 42, 0.08)"
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          background: `linear-gradient(135deg, ${theme.primaryColor} 0%, #111827 100%)`,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: theme.accentColor,
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              color: "#0b1220"
            }}
          >
            A
          </div>
          <div style={{ display: "grid" }}>
            <div style={{ fontWeight: 800, lineHeight: 1.15 }}>{theme.title}</div>
            <div style={{ fontSize: 12, opacity: 0.82 }}>{trialNote || "Powered by DocSpace"}</div>
          </div>
        </div>
      </div>

      <div
        ref={listRef}
        style={{
          height,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 12,
          background: "linear-gradient(180deg, rgba(248, 250, 252, 0.8) 0%, rgba(241, 245, 249, 0.55) 100%)"
        }}
      >
        {messages.map((m, idx) => (
          <div key={idx} style={bubbleStyle(m.role, theme)}>
            <div>{m.content}</div>
            {Array.isArray(m.links) && m.links.length ? (
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                {m.links.slice(0, 6).map((l, i) => (
                  <a
                    key={`${l.url}-${i}`}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: m.role === "user" ? "#fff" : theme.primaryColor,
                      textDecoration: "underline",
                      wordBreak: "break-word"
                    }}
                  >
                    {l.title}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {loading ? (
          <div style={bubbleStyle("assistant", theme)}>
            <span className="muted">Thinking...</span>
          </div>
        ) : null}
      </div>

      <div style={{ padding: 12, borderTop: "1px solid rgba(15, 23, 42, 0.08)", background: "#fff" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={canChat ? "Type a message..." : "Missing embed key"}
            onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
            className="input"
            style={{ flex: 1 }}
            disabled={!canChat}
          />
          <button className="btn" onClick={send} disabled={!canChat || loading} style={{ background: theme.primaryColor }}>
            Send
          </button>
        </div>
        {error ? <div style={{ color: "#b91c1c", marginTop: 8 }}>{error}</div> : null}
      </div>
    </div>
  );
}
