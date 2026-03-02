import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();
  const [publicId, setPublicId] = useState("");
  const [embedKey, setEmbedKey] = useState("");

  function openWidget() {
    const pid = publicId.trim();
    const key = embedKey.trim();
    if (!pid || !key) return;
    nav(`/w/${encodeURIComponent(pid)}?k=${encodeURIComponent(key)}`);
  }

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="hero">
        <div>
          <div className="hero-title">DocSpace Agents</div>
          <div className="hero-sub">
            Build a chat widget backed by DocSpace files. Share it publicly without exposing DocSpace.
          </div>
        </div>
        <div className="hero-actions">
          <button className="btn" onClick={() => nav("/studio")}>
            Open Studio
          </button>
          <button className="btn secondary" onClick={() => nav("/studio/login")}>
            Sign in
          </button>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-pad" style={{ display: "grid", gap: 10 }}>
            <div className="title">Studio</div>
            <div className="muted">
              Create agents, pick DocSpace rooms/folders/files, sync knowledge base, customize theme, and embed.
            </div>
            <div className="row" style={{ justifyContent: "flex-start", gap: 10 }}>
              <button className="btn" onClick={() => nav("/studio")}>
                Go to Studio
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-pad" style={{ display: "grid", gap: 10 }}>
            <div className="title">Widget (Public)</div>
            <div className="muted">Open a widget link using agent public id and embed key.</div>
            <div className="field">
              <label>Public ID</label>
              <input value={publicId} onChange={(e) => setPublicId(e.target.value)} placeholder="a_..." />
            </div>
            <div className="field">
              <label>Embed key</label>
              <input value={embedKey} onChange={(e) => setEmbedKey(e.target.value)} placeholder="k_..." />
            </div>
            <div className="row" style={{ justifyContent: "flex-start", gap: 10 }}>
              <button className="btn secondary" onClick={openWidget} disabled={!publicId.trim() || !embedKey.trim()}>
                Open widget
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
