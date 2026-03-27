import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/http.js";
import ChatWidget from "../components/ChatWidget.jsx";
import { useSession } from "../services/session.js";

const OPENAI_CHAT_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"];
const OPENAI_EMBED_MODELS = ["text-embedding-3-small", "text-embedding-3-large"];

function clamp(n, min, max) {
  const x = Number(n);
  if (Number.isNaN(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function normalizeHexColor(value, fallback = "#000000") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const v = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  return fallback;
}

function ColorField({ label, value, onChange }) {
  const inputRef = useRef(null);
  const safe = normalizeHexColor(value, "#000000");
  const [draft, setDraft] = useState(safe);

  useEffect(() => setDraft(safe), [safe]);

  return (
    <div className="field">
      <label>{label}</label>
      <div className="color-field">
        <button
          type="button"
          className="color-swatch"
          aria-label={`${label}: ${safe}`}
          title={safe}
          style={{ background: safe }}
          onClick={() => {
            const el = inputRef.current;
            if (!el) return;
            if (typeof el.showPicker === "function") el.showPicker();
            else el.click();
          }}
        />
        <input
          ref={inputRef}
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
          style={{ width: 1, height: 1, opacity: 0, position: "absolute", pointerEvents: "none" }}
        />
        <input
          className="input color-hex"
          value={draft}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            const normalized = normalizeHexColor(next, "");
            if (normalized) onChange(normalized);
          }}
          onBlur={() => setDraft(normalizeHexColor(draft, safe))}
          placeholder="#0f172a"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function toRoomTitle(room) {
  return String(room?.title || room?.name || "");
}

function ensureOption(list, current) {
  const cur = String(current || "").trim();
  const arr = Array.isArray(list) ? list.filter(Boolean).map(String) : [];
  if (cur && !arr.includes(cur)) return [cur, ...arr];
  return arr;
}

export default function StudioAgentEditor() {
  const { id } = useParams();
  const session = useSession();
  const detailsRef = useRef(null);
  const modelRef = useRef(null);
  const kbRef = useRef(null);
  const publishRef = useRef(null);
  const [setupStep, setSetupStep] = useState(1);

  const [agent, setAgent] = useState(null);
  const [usage, setUsage] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [includeRoomRoot, setIncludeRoomRoot] = useState(true);
  const [selectedFolderIds, setSelectedFolderIds] = useState([]);
  const [selectedFileIds, setSelectedFileIds] = useState([]);

  const [kbStats, setKbStats] = useState(null);
  const [kbBrowseFolderId, setKbBrowseFolderId] = useState("");
  const [kbBrowseContents, setKbBrowseContents] = useState(null);
  const [kbBrowsePath, setKbBrowsePath] = useState([]);
  const [localKbFile, setLocalKbFile] = useState(null);
  const [uploadingKbFile, setUploadingKbFile] = useState(false);
  const [kbUploadError, setKbUploadError] = useState("");

  const [openaiKeyDraft, setOpenaiKeyDraft] = useState("");
  const [clearOpenaiKey, setClearOpenaiKey] = useState(false);
  const [openaiChatModels, setOpenaiChatModels] = useState([]);
  const [openaiEmbedModels, setOpenaiEmbedModels] = useState([]);
  const [openaiModelsLoading, setOpenaiModelsLoading] = useState(false);
  const [openaiModelsError, setOpenaiModelsError] = useState("");

  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaModelsError, setOllamaModelsError] = useState("");

  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const embedCode = useMemo(() => {
    if (!agent?.publicId || !agent?.embedKey) return "";
    return `<script async src="${window.location.origin}/embed.js" data-agent-id="${agent.publicId}" data-agent-key="${agent.embedKey}"></script>`;
  }, [agent]);

  function copy(text) {
    const t = String(text || "");
    if (!t) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(t).catch(() => null);
      return;
    }
    try {
      const el = document.createElement("textarea");
      el.value = t;
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    } catch {
      // ignore
    }
  }

  async function loadAgent() {
    setError("");
    const res = await api(`/api/studio/agents/${encodeURIComponent(id)}`);
    const a = res?.agent || null;
    setAgent(a);
    setSelectedRoomId(a?.kb?.roomId || "");
    setIncludeRoomRoot(a?.kb?.includeRoomRoot !== false);
    setSelectedFolderIds(a?.kb?.folderIds || []);
    setSelectedFileIds(a?.kb?.fileIds || []);
    setOpenaiKeyDraft("");
    setClearOpenaiKey(false);
  }

  async function loadUsage() {
    const res = await api(`/api/studio/agents/${encodeURIComponent(id)}/usage`);
    setUsage(res || null);
  }

  async function loadKbStats() {
    const res = await api(`/api/studio/agents/${encodeURIComponent(id)}/kb-stats`);
    setKbStats(res?.stats || null);
    const cfg = res?.kbConfig || null;
    if (cfg && typeof cfg.includeRoomRoot === "boolean") setIncludeRoomRoot(cfg.includeRoomRoot);
    if (cfg && Array.isArray(cfg.fileIds)) setSelectedFileIds(cfg.fileIds);
  }

  async function loadRooms() {
    const res = await api("/api/studio/docspace/rooms");
    setRooms(res?.rooms || []);
  }

  async function loadFolder(folderId) {
    if (!folderId) return null;
    const res = await api(`/api/studio/docspace/folder/${encodeURIComponent(folderId)}`);
    return res?.contents || null;
  }

  useEffect(() => {
    Promise.all([loadAgent(), loadUsage(), loadKbStats(), loadRooms()]).catch((e) => setError(e?.message || "Load failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!selectedRoomId) return;
    setKbBrowseFolderId(selectedRoomId);
    setKbBrowsePath([{ id: selectedRoomId, title: "Room" }]);
  }, [selectedRoomId]);

  useEffect(() => {
    if (!kbBrowseFolderId) return;
    loadFolder(kbBrowseFolderId)
      .then((c) => setKbBrowseContents(c))
      .catch(() => setKbBrowseContents(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbBrowseFolderId]);

  async function loadOllamaModels(baseUrl) {
    const url = String(baseUrl || "").trim();
    if (!url) {
      setOllamaModels([]);
      setOllamaModelsError("");
      return;
    }
    setOllamaModelsLoading(true);
    setOllamaModelsError("");
    try {
      const res = await api(`/api/studio/ollama/models?baseUrl=${encodeURIComponent(url)}`);
      setOllamaModels(res?.models || []);
    } catch (e) {
      setOllamaModels([]);
      const msg = String(e?.message || "").trim();
      if (!msg || msg.toLowerCase() === "fetch failed") {
        setOllamaModelsError(`Cannot reach Ollama at ${url}. Make sure Ollama is running.`);
      } else {
        setOllamaModelsError(msg);
      }
    } finally {
      setOllamaModelsLoading(false);
    }
  }

  useEffect(() => {
    if (agent?.llm?.provider !== "ollama") return;
    loadOllamaModels(agent?.llm?.ollama?.baseUrl || "").catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.llm?.provider, agent?.llm?.ollama?.baseUrl]);

  async function loadOpenAiModels() {
    setOpenaiModelsLoading(true);
    setOpenaiModelsError("");
    try {
      const res = await api("/api/studio/openai/models", {
        method: "POST",
        body: { agentId: id, apiKey: openaiKeyDraft.trim() ? openaiKeyDraft.trim() : undefined }
      });
      setOpenaiChatModels(res?.chatModels || []);
      setOpenaiEmbedModels(res?.embeddingModels || []);
    } catch (e) {
      setOpenaiChatModels([]);
      setOpenaiEmbedModels([]);
      setOpenaiModelsError(e?.message || "Failed to load OpenAI models");
    } finally {
      setOpenaiModelsLoading(false);
    }
  }

  function toggleFolder(folderId) {
    const fid = String(folderId);
    setSelectedFolderIds((prev) => {
      const set = new Set(prev.map(String));
      if (set.has(fid)) set.delete(fid);
      else set.add(fid);
      return Array.from(set);
    });
  }

  function toggleFile(fileId) {
    const fid = String(fileId);
    setSelectedFileIds((prev) => {
      const set = new Set(prev.map(String));
      if (set.has(fid)) set.delete(fid);
      else set.add(fid);
      return Array.from(set);
    });
  }

  function openBrowseFolder(folder) {
    const fid = String(folder?.id || "").trim();
    if (!fid) return;
    setKbBrowseFolderId(fid);
    setKbBrowsePath((prev) => [...prev, { id: fid, title: String(folder?.title || "Folder") }]);
  }

  function goToCrumb(index) {
    setKbBrowsePath((prev) => {
      const next = prev.slice(0, index + 1);
      const crumb = next[index];
      if (crumb?.id) setKbBrowseFolderId(String(crumb.id));
      return next;
    });
  }

  async function uploadKbFile() {
    if (!selectedRoomId) {
      setKbUploadError("Select a room first.");
      return;
    }
    if (!localKbFile) {
      setKbUploadError("Choose a file to upload.");
      return;
    }

    const folderId = String(kbBrowseFolderId || selectedRoomId || "").trim();
    if (!folderId) {
      setKbUploadError("Select a room/folder first.");
      return;
    }

    setKbUploadError("");
    setStatus("");
    setUploadingKbFile(true);
    try {
      const form = new FormData();
      form.append("folderId", folderId);
      form.append("file", localKbFile, localKbFile.name);
      const res = await api("/api/studio/docspace/upload", { method: "POST", body: form });

      const uploadedId = String(res?.file?.id || "").trim();
      if (uploadedId) {
        setSelectedFileIds((prev) => Array.from(new Set([...(prev || []).map(String), uploadedId])));
      }

      setLocalKbFile(null);
      const fresh = await loadFolder(folderId);
      if (fresh) setKbBrowseContents(fresh);
      setStatus("File uploaded.");
    } catch (e) {
      setKbUploadError(e?.message || "Upload failed");
    } finally {
      setUploadingKbFile(false);
    }
  }

  async function save() {
    if (!agent) return;
    setError("");
    setStatus("");
    setSaving(true);
    try {
      const provider = agent?.llm?.provider || "ollama";
      const openai = agent?.llm?.openai || {};
      const ollama = agent?.llm?.ollama || {};
      const theme = agent?.theme || {};
      const billing = agent?.billing || {};

      const llmPatch = {
        provider,
        openai: {
          chatModel: openai.chatModel || "",
          embedModel: openai.embedModel || ""
        },
        ollama: {
          baseUrl: ollama.baseUrl || "",
          chatModel: ollama.chatModel || "",
          embedModel: ollama.embedModel || ""
        }
      };
      if (clearOpenaiKey) llmPatch.openai.apiKey = "";
      else if (openaiKeyDraft.trim()) llmPatch.openai.apiKey = openaiKeyDraft.trim();

      const payload = {
        name: agent?.name || "Agent",
        systemPrompt: agent?.systemPrompt || "",
        llm: llmPatch,
        kb: {
          roomId: selectedRoomId || "",
          includeRoomRoot,
          folderIds: selectedFolderIds || [],
          fileIds: selectedFileIds || []
        },
        theme: {
          title: theme.title || agent?.name || "Chat",
          launcherText: theme.launcherText || agent?.name || "Chat",
          primaryColor: theme.primaryColor || "#0f172a",
          accentColor: theme.accentColor || "#38bdf8",
          borderRadius: clamp(theme.borderRadius ?? 18, 8, 28),
          position: theme.position || "right"
        },
        billing: {
          trialMessages: Number(billing.trialMessages || 5),
          requireOwnKeyAfterTrial: billing.requireOwnKeyAfterTrial !== false
        }
      };

      const res = await api(`/api/studio/agents/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
      setAgent(res?.agent || agent);
      setStatus("Saved.");
      await Promise.all([loadUsage().catch(() => null), loadKbStats().catch(() => null)]);
    } catch (e) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function syncKb() {
    setError("");
    setStatus("");
    setSyncing(true);
    try {
      const res = await api(`/api/studio/agents/${encodeURIComponent(id)}/sync`, { method: "POST" });
      const r = res?.result || null;
      setStatus(res?.message ? `${res.message}${r ? ` (files=${r.filesIndexed}, chunks=${r.chunks})` : ""}` : "Synced.");
      await Promise.all([loadUsage().catch(() => null), loadKbStats().catch(() => null)]);
    } catch (e) {
      setError(e?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function deleteThisAgent() {
    if (!agent?.id) return;
    const ok = window.confirm(`Delete agent "${agent?.name || "Agent"}"? This cannot be undone.`);
    if (!ok) return;
    setError("");
    try {
      await api(`/api/studio/agents/${encodeURIComponent(agent.id)}`, { method: "DELETE" });
      window.location.href = "/studio";
    } catch (e) {
      setError(e?.message || "Delete failed");
    }
  }

  function goStep(step) {
    const s = Math.max(1, Math.min(4, Number(step) || 1));
    setSetupStep(s);
    const map = {
      1: detailsRef,
      2: modelRef,
      3: kbRef,
      4: publishRef
    };
    const el = map[s]?.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const kbConnected = Number(kbStats?.chunks || 0) > 0;

  if (!agent) {
    return (
      <div className="container">
        <div className="muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="row" style={{ marginBottom: 12 }}>
        <div>
          <div className="title">{agent?.name || "Agent"}</div>
          <div className="muted">Configure behavior, knowledge, models, and styling.</div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link className="btn secondary" to="/studio" style={{ textDecoration: "none" }}>
            Back
          </Link>
          {!session.isDemo ? (
            <button className="btn secondary" onClick={deleteThisAgent}>
              Delete
            </button>
          ) : null}
          {!session.isDemo ? (
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-pad" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 900 }}>Guided setup</div>
          <div className="row" style={{ justifyContent: "flex-start", gap: 10, flexWrap: "wrap" }}>
            <button className={`btn secondary ${setupStep === 1 ? "is-active" : ""}`} type="button" onClick={() => goStep(1)}>
              1) Details
            </button>
            <button className={`btn secondary ${setupStep === 2 ? "is-active" : ""}`} type="button" onClick={() => goStep(2)}>
              2) Model
            </button>
            <button className={`btn secondary ${setupStep === 3 ? "is-active" : ""}`} type="button" onClick={() => goStep(3)}>
              3) Knowledge
            </button>
            <button className={`btn secondary ${setupStep === 4 ? "is-active" : ""}`} type="button" onClick={() => goStep(4)}>
              4) Publish
            </button>
          </div>
          <div className="muted" style={{ fontSize: "0.92rem" }}>
            Do it in order: set details → pick models → connect files → sync KB → publish.
          </div>
        </div>
      </div>

      {!kbConnected ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-pad" style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "grid", gap: 2 }}>
              <div style={{ fontWeight: 800 }}>Knowledge base is not connected</div>
              <div className="muted" style={{ fontSize: "0.92rem" }}>
                Select files for this agent and run Sync KB to enable answers from your documents.
              </div>
            </div>
            <button className="btn secondary" type="button" onClick={syncKb} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync KB"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</div> : null}
      {status ? <div style={{ color: "#15803d", marginBottom: 12 }}>{status}</div> : null}

      <div className="grid-2" style={setupStep === 4 ? undefined : { gridTemplateColumns: "1fr" }}>
        <div className="card" style={setupStep === 3 ? { display: "none" } : undefined}>
          <div className="card-pad" style={{ display: "grid", gap: 12 }}>
            {setupStep === 1 ? (
              <>
                <div ref={detailsRef} />
                <div className="title" style={{ fontSize: "1.1rem" }}>
                  Agent
                </div>

                <div className="field">
                  <label>Name</label>
                  <input
                    value={agent?.name || ""}
                    onChange={(e) => setAgent((p) => ({ ...(p || {}), name: e.target.value }))}
                    placeholder="Agent name"
                  />
                </div>

                <div className="field">
                  <label>System prompt</label>
                  <textarea
                    value={agent?.systemPrompt || ""}
                    onChange={(e) => setAgent((p) => ({ ...(p || {}), systemPrompt: e.target.value }))}
                    placeholder="Goal, tone, constraints…"
                  />
                </div>
              </>
            ) : null}

            {setupStep === 2 ? (
              <>
                <div ref={modelRef} />
                <div className="title" style={{ fontSize: "1.1rem" }}>
                  Model
                </div>

            <div className="field">
              <label>Provider</label>
              <select
                value={agent?.llm?.provider || "ollama"}
                onChange={(e) => setAgent((p) => ({ ...(p || {}), llm: { ...(p?.llm || {}), provider: e.target.value } }))}
              >
                <option value="ollama">Ollama</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>

            {agent?.llm?.provider === "openai" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div className="field">
                  <label>OpenAI API key (optional)</label>
                  <input
                    type="password"
                    value={openaiKeyDraft}
                    onChange={(e) => {
                      setClearOpenaiKey(false);
                      setOpenaiKeyDraft(e.target.value);
                    }}
                    placeholder={agent?.llm?.openai?.apiKey ? "Key is set (leave empty to keep)" : "sk-..."}
                  />
                  <label className="chip" style={{ cursor: "pointer", width: "fit-content" }}>
                    <input type="checkbox" checked={clearOpenaiKey} onChange={(e) => setClearOpenaiKey(e.target.checked)} />
                    <span>Clear key</span>
                  </label>

                  <div className="row" style={{ justifyContent: "flex-start", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                    <button className="btn secondary" type="button" onClick={loadOpenAiModels} disabled={openaiModelsLoading}>
                      {openaiModelsLoading ? "Loading models..." : "Load models"}
                    </button>
                    <div className="muted" style={{ fontSize: "0.9rem" }}>
                      Uses the key above (if provided), otherwise the saved key or server key.
                    </div>
                  </div>
                  {openaiModelsError ? <div style={{ color: "#b91c1c", fontSize: "0.9rem", marginTop: 6 }}>{openaiModelsError}</div> : null}
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label>Chat model</label>
                    <select
                      value={agent?.llm?.openai?.chatModel || ""}
                      onChange={(e) =>
                        setAgent((p) => ({ ...(p || {}), llm: { ...(p?.llm || {}), openai: { ...(p?.llm?.openai || {}), chatModel: e.target.value } } }))
                      }
                    >
                      <option value="">Select model...</option>
                      {ensureOption(openaiChatModels.length ? openaiChatModels : OPENAI_CHAT_MODELS, agent?.llm?.openai?.chatModel).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Embedding model</label>
                    <select
                      value={agent?.llm?.openai?.embedModel || ""}
                      onChange={(e) =>
                        setAgent((p) => ({ ...(p || {}), llm: { ...(p?.llm || {}), openai: { ...(p?.llm?.openai || {}), embedModel: e.target.value } } }))
                      }
                    >
                      <option value="">Select model...</option>
                      {ensureOption(openaiEmbedModels.length ? openaiEmbedModels : OPENAI_EMBED_MODELS, agent?.llm?.openai?.embedModel).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div className="field">
                  <label>Ollama URL</label>
                  <input
                    value={agent?.llm?.ollama?.baseUrl || ""}
                    onChange={(e) =>
                      setAgent((p) => ({ ...(p || {}), llm: { ...(p?.llm || {}), ollama: { ...(p?.llm?.ollama || {}), baseUrl: e.target.value } } }))
                    }
                    placeholder="http://localhost:11434"
                  />
                </div>

                <div className="grid-2">
                  <div className="field">
                    <label>Chat model</label>
                    <select
                      value={agent?.llm?.ollama?.chatModel || ""}
                      onChange={(e) =>
                        setAgent((p) => ({ ...(p || {}), llm: { ...(p?.llm || {}), ollama: { ...(p?.llm?.ollama || {}), chatModel: e.target.value } } }))
                      }
                    >
                      <option value="">Select model...</option>
                      {ollamaModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Embedding model</label>
                    <select
                      value={agent?.llm?.ollama?.embedModel || ""}
                      onChange={(e) =>
                        setAgent((p) => ({ ...(p || {}), llm: { ...(p?.llm || {}), ollama: { ...(p?.llm?.ollama || {}), embedModel: e.target.value } } }))
                      }
                    >
                      <option value="">Select model...</option>
                      {ollamaModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {ollamaModelsLoading ? <div className="muted" style={{ fontSize: "0.9rem" }}>Loading models…</div> : null}
                {ollamaModelsError ? <div style={{ color: "#b91c1c", fontSize: "0.9rem" }}>{ollamaModelsError}</div> : null}
              </div>
            )}

              </>
            ) : null}

            {setupStep === 4 ? (
              <>
                <div ref={publishRef} />
                <div className="title" style={{ fontSize: "1.1rem" }}>
                  Publish
                </div>

                <div className="title" style={{ fontSize: "1.05rem" }}>
                  Billing
                </div>
                <div className="field">
                  <label>Free messages (trial)</label>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={agent?.billing?.trialMessages ?? 5}
                    onChange={(e) => setAgent((p) => ({ ...(p || {}), billing: { ...(p?.billing || {}), trialMessages: Number(e.target.value || 0) } }))}
                  />
                  <div className="muted" style={{ fontSize: "0.9rem" }}>Used: {usage?.trial?.used ?? 0}</div>
                </div>

                <div className="divider" />
                <div className="title" style={{ fontSize: "1.05rem" }}>
                  Theme
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label>Title</label>
                    <input
                      value={agent?.theme?.title || ""}
                      onChange={(e) => setAgent((p) => ({ ...(p || {}), theme: { ...(p?.theme || {}), title: e.target.value } }))}
                      placeholder="Chat"
                    />
                  </div>
                  <div className="field">
                    <label>Launcher text</label>
                    <input
                      value={agent?.theme?.launcherText || ""}
                      onChange={(e) => setAgent((p) => ({ ...(p || {}), theme: { ...(p?.theme || {}), launcherText: e.target.value } }))}
                      placeholder="Chat"
                    />
                  </div>
                </div>
                <div className="grid-2">
                  <ColorField
                    label="Primary color"
                    value={agent?.theme?.primaryColor || "#0f172a"}
                    onChange={(next) => setAgent((p) => ({ ...(p || {}), theme: { ...(p?.theme || {}), primaryColor: next } }))}
                  />
                  <ColorField
                    label="Accent color"
                    value={agent?.theme?.accentColor || "#38bdf8"}
                    onChange={(next) => setAgent((p) => ({ ...(p || {}), theme: { ...(p?.theme || {}), accentColor: next } }))}
                  />
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label>Border radius</label>
                    <input
                      type="number"
                      min={8}
                      max={28}
                      value={agent?.theme?.borderRadius ?? 18}
                      onChange={(e) =>
                        setAgent((p) => ({ ...(p || {}), theme: { ...(p?.theme || {}), borderRadius: Number(e.target.value || 18) } }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Position</label>
                    <select
                      value={agent?.theme?.position || "right"}
                      onChange={(e) => setAgent((p) => ({ ...(p || {}), theme: { ...(p?.theme || {}), position: e.target.value } }))}
                    >
                      <option value="right">Right</option>
                      <option value="left">Left</option>
                    </select>
                  </div>
                </div>

                <div className="divider" />
                <div className="title" style={{ fontSize: "1.05rem" }}>
                  Embed
                </div>
                <div className="field">
                  <label>Embed script</label>
                  <textarea readOnly value={embedCode} />
                  <div className="row" style={{ justifyContent: "flex-start", gap: 10, flexWrap: "wrap" }}>
                    <button className="btn secondary" type="button" onClick={() => copy(embedCode)} disabled={!embedCode}>
                      Copy embed code
                    </button>
                    {agent?.publicId && agent?.embedKey ? (
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => copy(`${window.location.origin}/w/${agent.publicId}?k=${agent.embedKey}`)}
                      >
                        Copy widget link
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}

            <div className="divider" />
            <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
              {setupStep === 1 ? (
                <button className="btn secondary" type="button" onClick={save} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              ) : (
                <button className="btn secondary" type="button" onClick={() => goStep(setupStep === 2 ? 1 : 3)}>
                  Back
                </button>
              )}

              {setupStep === 1 ? (
                <button className="btn" type="button" onClick={() => goStep(2)}>
                  Next: Model
                </button>
              ) : setupStep === 2 ? (
                <button className="btn" type="button" onClick={() => goStep(3)}>
                  Next: Knowledge
                </button>
              ) : (
                <button className="btn" type="button" onClick={save} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card" style={setupStep === 1 || setupStep === 2 ? { display: "none" } : undefined}>
          <div className="card-pad" style={{ display: "grid", gap: 12 }}>
            <div ref={kbRef} />
            <div className="title" style={{ fontSize: "1.1rem" }}>
              {setupStep === 3 ? "Knowledge base" : "Preview"}
            </div>
            <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div className="muted" style={{ fontSize: "0.9rem" }}>
                Status: {kbConnected ? "Synced" : "Not connected"}
                {kbStats ? ` · Files: ${kbStats.fileCount || 0}` : ""}
              </div>
              {setupStep === 3 ? (
                <button className="btn" type="button" onClick={syncKb} disabled={syncing}>
                  {syncing ? "Syncing..." : "Sync KB"}
                </button>
              ) : (
                <button className="btn secondary" type="button" onClick={() => goStep(3)}>
                  Edit knowledge
                </button>
              )}
            </div>

            {setupStep === 3 ? (
              <>
                <div className="field">
                  <label>Room</label>
                  <select value={selectedRoomId} onChange={(e) => setSelectedRoomId(e.target.value)}>
                    <option value="">Select room...</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={String(r.id)}>
                        {toRoomTitle(r)}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedRoomId ? (
                  <label className="chip" style={{ cursor: "pointer", width: "fit-content" }}>
                    <input type="checkbox" checked={includeRoomRoot} onChange={(e) => setIncludeRoomRoot(e.target.checked)} />
                    <span>Index room root</span>
                  </label>
                ) : (
                  <div className="muted">Pick a room to browse files.</div>
                )}

                {kbBrowsePath?.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {kbBrowsePath.map((c, idx) => (
                      <button key={c.id} className="btn secondary sm" type="button" onClick={() => goToCrumb(idx)}>
                        {c.title}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="field">
                  <label>Add file from your computer (optional)</label>
                  <div className="row" style={{ justifyContent: "flex-start", gap: 10, flexWrap: "wrap" }}>
                    <label className="btn secondary" style={{ cursor: "pointer" }}>
                      Choose file
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt,.md,.csv,.json,.xlsx,.xls,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                        onChange={(e) => setLocalKbFile(e.target.files?.[0] || null)}
                        style={{ display: "none" }}
                      />
                    </label>
                    <button className="btn secondary" type="button" onClick={uploadKbFile} disabled={!selectedRoomId || !localKbFile || uploadingKbFile}>
                      {uploadingKbFile ? "Uploading..." : "Upload to current folder"}
                    </button>
                    {localKbFile ? (
                      <div className="muted" style={{ fontSize: "0.9rem" }}>
                        {localKbFile.name}
                      </div>
                    ) : null}
                  </div>
                  {kbUploadError ? <div style={{ color: "#b91c1c", fontSize: "0.9rem" }}>{kbUploadError}</div> : null}
                  <div className="muted" style={{ fontSize: "0.9rem" }}>
                    Upload into the selected room/folder, then select it for indexing.
                  </div>
                </div>

                {kbBrowseContents?.items?.length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {(kbBrowseContents.items || [])
                      .filter((i) => i.type === "folder")
                      .slice(0, 60)
                      .map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className="btn secondary"
                          onClick={() => openBrowseFolder(f)}
                          style={{ justifyContent: "flex-start", textAlign: "left" }}
                        >
                          <span style={{ marginRight: 8 }}>📁</span>
                          <span>{f.title || "Folder"}</span>
                        </button>
                      ))}
                    {(kbBrowseContents.items || [])
                      .filter((i) => i.type === "file")
                      .slice(0, 120)
                      .map((f) => (
                        <label key={f.id} className="chip" style={{ cursor: "pointer" }}>
                          <input type="checkbox" checked={selectedFileIds.map(String).includes(String(f.id))} onChange={() => toggleFile(f.id)} />
                          <span>{f.title || "File"}</span>
                        </label>
                      ))}
                  </div>
                ) : selectedRoomId ? (
                  <div className="muted">Open the room to browse files.</div>
                ) : null}

                {selectedFileIds?.length ? (
                  <div className="muted" style={{ fontSize: "0.9rem" }}>Selected files: {selectedFileIds.length}</div>
                ) : null}

                <details>
                  <summary className="muted">Folders (optional)</summary>
                  <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    <div className="muted">Pick folders to index recursively (optional).</div>
                    {selectedRoomId ? (
                      <FolderPicker roomId={selectedRoomId} selectedFolderIds={selectedFolderIds} toggleFolder={toggleFolder} />
                    ) : (
                      <div className="muted">Select a room first.</div>
                    )}
                  </div>
                </details>

                <div className="divider" />
                <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                  <button className="btn secondary" type="button" onClick={() => goStep(2)}>
                    Back
                  </button>
                  <button className="btn" type="button" onClick={() => goStep(4)} disabled={!kbConnected}>
                    Next: Publish
                  </button>
                </div>
                {!kbConnected ? <div className="muted">Sync KB first to enable Publish.</div> : null}
              </>
            ) : (
              <>
                {agent?.publicId && agent?.embedKey ? (
                  <ChatWidget publicId={agent.publicId} embedKey={agent.embedKey} height={"min(62vh, 760px)"} themeOverride={agent.theme || {}} />
                ) : (
                  <div className="muted">Save the agent first to enable preview.</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  function FolderPicker({ roomId, selectedFolderIds, toggleFolder }) {
    const [contents, setContents] = useState(null);
    useEffect(() => {
      loadFolder(roomId)
        .then((c) => setContents(c))
        .catch(() => setContents(null));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId]);

    const folders = (contents?.items || []).filter((i) => i.type === "folder").slice(0, 60);
    if (!folders.length) return <div className="muted">No folders found.</div>;
    return (
      <>
        {folders.map((f) => (
          <label key={f.id} className="chip" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={selectedFolderIds.map(String).includes(String(f.id))} onChange={() => toggleFolder(f.id)} />
            <span>{f.title || "Folder"}</span>
          </label>
        ))}
      </>
    );
  }
}
