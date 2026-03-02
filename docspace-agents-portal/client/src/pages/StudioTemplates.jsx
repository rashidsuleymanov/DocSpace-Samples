import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../services/http.js";
import { AGENT_TEMPLATES } from "../templates/agentTemplates.js";

export default function StudioTemplates() {
  const [loadingId, setLoadingId] = useState("");
  const [error, setError] = useState("");
  const nav = useNavigate();

  async function useTemplate(tpl) {
    setError("");
    setLoadingId(tpl.id);
    try {
      const created = await api("/api/studio/agents", { method: "POST", body: { name: tpl.name } });
      const id = created?.agent?.id;
      if (!id) throw new Error("Create failed");
      await api(`/api/studio/agents/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: { systemPrompt: tpl.systemPrompt }
      });
      nav(`/studio/agents/${id}`);
    } catch (e) {
      setError(e?.message || "Failed");
    } finally {
      setLoadingId("");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Templates</h1>
          <div className="page-sub">
            Templates create a new agent. After that, connect knowledge and models in the agent settings.
          </div>
        </div>
        <div className="row page-actions" style={{ gap: 10 }}>
          <Link className="btn secondary" to="/studio" style={{ textDecoration: "none" }}>
            Back to agents
          </Link>
        </div>
      </div>

      {error ? <div style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</div> : null}

      <div className="template-grid">
        {AGENT_TEMPLATES.map((t) => (
          <div key={t.id} className="card template-card">
            <div className="card-pad">
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontWeight: 900, fontSize: "1.05rem" }}>{t.name}</div>
                <div className="muted" style={{ lineHeight: 1.4 }}>
                  {t.description}
                </div>
              </div>
              <div className="row" style={{ justifyContent: "flex-start", marginTop: "auto" }}>
                <button className="btn" onClick={() => useTemplate(t)} disabled={loadingId === t.id}>
                  {loadingId === t.id ? "Creating..." : "Use template"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
