import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/http.js";
import { useSession } from "../services/session.js";

export default function StudioAgents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const nav = useNavigate();
  const session = useSession();

  async function load() {
    setError("");
    setLoading(true);
    try {
      const res = await api("/api/studio/agents");
      setAgents(res?.agents || []);
    } catch (err) {
      setError(err?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createAgent() {
    setError("");
    try {
      const res = await api("/api/studio/agents", {
        method: "POST",
        body: { name: "New agent" }
      });
      const id = res?.agent?.id;
      if (id) nav(`/studio/agents/${id}`);
      else await load();
    } catch (err) {
      setError(err?.message || "Create failed");
    }
  }

  async function deleteAgent(agent) {
    const id = agent?.id;
    if (!id) return;
    const ok = window.confirm(`Delete agent "${agent?.name || "Agent"}"? This cannot be undone.`);
    if (!ok) return;
    setError("");
    try {
      await api(`/api/studio/agents/${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err?.message || "Delete failed");
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return (agents || []).filter((a) => {
      const name = String(a?.name || "").toLowerCase();
      return name.includes(q);
    });
  }, [agents, query]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Agents</h1>
          <div className="page-sub">Create, configure, and embed chat agents backed by your files.</div>
        </div>
        <div className="row page-actions" style={{ gap: 10 }}>
          <button className="btn secondary" onClick={load} disabled={loading}>
            Refresh
          </button>
          {!session.isDemo ? (
            <button className="btn" onClick={createAgent}>
              Create agent
            </button>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="card-pad">
          <div className="row" style={{ gap: 10, justifyContent: "space-between", marginBottom: 12 }}>
            <div className="field" style={{ flex: 1, maxWidth: 560 }}>
              <label>Search</label>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Agent name..." />
            </div>
          </div>

          {loading ? <div className="muted">Loading...</div> : null}
          {error ? <div style={{ color: "#b91c1c" }}>{error}</div> : null}
          {!loading && !filtered.length ? (
            <div className="muted">
              No agents yet. Create one or start from a template in <a href="/studio/templates">Templates</a>.
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
            {filtered.map((a) => (
              <div key={a.id} className="agent-card">
                <div className="agent-meta">
                  <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{a.name}</div>
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <button className="btn secondary" onClick={() => nav(`/studio/agents/${a.id}`)}>
                    {session.isDemo ? "Посмотреть" : "Edit"}
                  </button>
                  {!session.isDemo ? (
                    <button className="btn secondary" onClick={() => deleteAgent(a)}>
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
