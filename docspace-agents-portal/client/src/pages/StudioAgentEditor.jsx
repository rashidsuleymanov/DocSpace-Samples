import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/http.js";
import ChatWidget from "../components/ChatWidget.jsx";

const OPENAI_CHAT_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "gpt-4o-realtime-preview"];
const OPENAI_EMBED_MODELS = ["text-embedding-3-small", "text-embedding-3-large"];

function toRoomTitle(room) {
  const title = room?.title || room?.name || "";
  return String(title || "");
}

export default function StudioAgentEditor() {
  const { id } = useParams();
  const [agent, setAgent] = useState(null);
  const [usage, setUsage] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [folderContents, setFolderContents] = useState(null);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [includeRoomRoot, setIncludeRoomRoot] = useState(true);
  const [selectedFolderIds, setSelectedFolderIds] = useState([]);
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [kbBrowseFolderId, setKbBrowseFolderId] = useState("");
  const [kbBrowseContents, setKbBrowseContents] = useState(null);
  const [kbBrowsePath, setKbBrowsePath] = useState([]);
  const [kbStats, setKbStats] = useState(null);
  const [kbAudits, setKbAudits] = useState([]);
  const [kbTestQuery, setKbTestQuery] = useState("");
  const [kbTestSnippets, setKbTestSnippets] = useState([]);
  const [openaiKeyDraft, setOpenaiKeyDraft] = useState("");
  const [clearOpenaiKey, setClearOpenaiKey] = useState(false);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaModelsError, setOllamaModelsError] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const embedCode = useMemo(() => {
    if (!agent?.publicId || !agent?.embedKey) return "";
    return `<script async src="${window.location.origin}/embed.js" data-docspace-agent="${agent.publicId}" data-docspace-key="${agent.embedKey}"></script>`;
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
    setAgent(res?.agent || null);
    setSelectedFolderIds(res?.agent?.kb?.folderIds || []);
    setSelectedRoomId(res?.agent?.kb?.roomId || "");
    setIncludeRoomRoot(res?.agent?.kb?.includeRoomRoot !== false);
    setSelectedFileIds(res?.agent?.kb?.fileIds || []);
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
    setKbAudits(res?.audits || []);
    const cfg = res?.kbConfig || null;
    if (cfg && typeof cfg.includeRoomRoot === "boolean") {
      setIncludeRoomRoot(cfg.includeRoomRoot);
    }
    if (cfg && Array.isArray(cfg.fileIds)) {
      setSelectedFileIds(cfg.fileIds);
    }
  }

  async function loadRooms() {
    const res = await api("/api/studio/docspace/rooms");
    setRooms(res?.rooms || []);
  }

  async function loadFolder(roomIdOrFolderId) {
    if (!roomIdOrFolderId) {
      setFolderContents(null);
      return;
    }
    const res = await api(`/api/studio/docspace/folder/${encodeURIComponent(roomIdOrFolderId)}`);
    setFolderContents(res?.contents || null);
  }

  useEffect(() => {
    Promise.all([loadAgent(), loadRooms(), loadUsage(), loadKbStats()]).catch((err) => setError(err?.message || "Load failed"));
  }, [id]);

  useEffect(() => {
    if (!selectedRoomId) return;
    loadFolder(selectedRoomId).catch(() => null);
    setKbBrowseFolderId(selectedRoomId);
    setKbBrowsePath([{ id: selectedRoomId, title: "Room" }]);
  }, [selectedRoomId]);

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
    } catch (err) {
      setOllamaModels([]);
      setOllamaModelsError(err?.message || "Failed to load Ollama models");
    } finally {
      setOllamaModelsLoading(false);
    }
  }

  useEffect(() => {
    if (agent?.llm?.provider !== "ollama") return;
    const baseUrl = agent?.llm?.ollama?.baseUrl || "";
    loadOllamaModels(baseUrl).catch(() => null);
  }, [agent?.llm?.provider, agent?.llm?.ollama?.baseUrl]);

  async function loadKbBrowseFolder(folderId) {
    const fid = String(folderId || "").trim();
    if (!fid) return;
    const res = await api(`/api/studio/docspace/folder/${encodeURIComponent(fid)}`);
    setKbBrowseContents(res?.contents || null);
  }

  useEffect(() => {
    if (!kbBrowseFolderId) return;
    loadKbBrowseFolder(kbBrowseFolderId).catch(() => null);
  }, [kbBrowseFolderId]);

  async function save() {
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
      if (clearOpenaiKey) {
        llmPatch.openai.apiKey = "";
      } else if (openaiKeyDraft.trim()) {
        llmPatch.openai.apiKey = openaiKeyDraft.trim();
      }

      const payload = {
        name: agent?.name || "Agent",
        systemPrompt: agent?.systemPrompt || "",
        llm: llmPatch,
        tools: agent?.tools || { allowAllDocSpace: false },
        kb: {
          roomId: selectedRoomId || "",
          includeRoomRoot,
          folderIds: selectedFolderIds || [],
          fileIds: selectedFileIds || []
        },
        theme: {
          title: theme.title || "Chat",
          launcherText: theme.launcherText || "Chat",
          primaryColor: theme.primaryColor || "#0f172a",
          accentColor: theme.accentColor || "#38bdf8",
          borderRadius: Number(theme.borderRadius || 18),
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
      await loadUsage().catch(() => null);
      await loadKbStats().catch(() => null);
    } catch (err) {
      setError(err?.message || "Save failed");
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
      const firstSkip = Array.isArray(r?.skipped) && r.skipped.length ? r.skipped[0] : null;
      setStatus(
        res?.message
          ? `${res.message}${r ? ` (filesSeen=${r.filesSeen}, filesIndexed=${r.filesIndexed}, chunks=${r.chunks})` : ""}`
          : "Sync started."
      );
      if (firstSkip?.reason) {
        setStatus((prev) => `${prev}\nFirst skip: ${firstSkip.reason}${firstSkip.error ? ` (${firstSkip.error})` : ""}`);
      }
      await loadUsage().catch(() => null);
      await loadKbStats().catch(() => null);
    } catch (err) {
      setError(err?.message || "Sync failed");
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
    } catch (err) {
      setError(err?.message || "Delete failed");
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
    setKbBrowsePath((prev) => [...prev, { id: fid, title: folder?.title || `Folder ${fid}` }]);
  }

  function goToCrumb(index) {
    setKbBrowsePath((prev) => {
      const next = prev.slice(0, index + 1);
      const crumb = next[index];
      if (crumb?.id) setKbBrowseFolderId(String(crumb.id));
      return next;
    });
  }

  async function runKbTest() {
    const q = kbTestQuery.trim();
    if (!q) return;
    setError("");
    try {
      const res = await api(`/api/studio/agents/${encodeURIComponent(id)}/kb-test?q=${encodeURIComponent(q)}`);
      setKbTestSnippets(res?.snippets || []);
    } catch (err) {
      setError(err?.message || "KB test failed");
    }
  }

  return (
    <div className="container">
      <div className="row" style={{ marginBottom: 12 }}>
        <div>
          <div className="title">{agent?.name || "Agent"}</div>
          <div className="muted">Manage behavior, knowledge, models, and styling.</div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link className="btn secondary" to="/studio" style={{ textDecoration: "none" }}>
            Back
          </Link>
          <button className="btn secondary" onClick={deleteThisAgent}>
            Delete
          </button>
          <button className="btn secondary" onClick={syncKb} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync KB"}
          </button>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {error ? <div style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</div> : null}
      {status ? <div style={{ color: "#15803d", marginBottom: 12 }}>{status}</div> : null}

      <div className="grid-2">
        <div className="card">
          <div className="card-pad" style={{ display: "grid", gap: 12 }}>
            <div className="title" style={{ fontSize: "1.1rem" }}>
              Agent settings
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
                placeholder="Define goal, tone, constraints. Mention it can use DocSpace tools."
              />
            </div>
            <div className="field">
              <label>LLM provider</label>
              <select
                value={agent?.llm?.provider || "ollama"}
                onChange={(e) =>
                  setAgent((p) => ({
                    ...(p || {}),
                    llm: { ...(p?.llm || {}), provider: e.target.value }
                  }))
                }
              >
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>

            {agent?.llm?.provider === "openai" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div className="field">
                  <label>OpenAI API key (optional, required after trial)</label>
                  <input
                    type="password"
                    value={openaiKeyDraft}
                    onChange={(e) => {
                      setClearOpenaiKey(false);
                      setOpenaiKeyDraft(e.target.value);
                    }}
                    placeholder={agent?.llm?.openai?.apiKey ? "Key is set (leave empty to keep)" : "sk-..."}
                  />
                  <div className="row" style={{ justifyContent: "flex-start", gap: 10 }}>
                    <label className="chip" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={clearOpenaiKey}
                        onChange={(e) => {
                          setClearOpenaiKey(e.target.checked);
                          if (e.target.checked) setOpenaiKeyDraft("");
                        }}
                      />
                      <span>Clear key</span>
                    </label>
                  </div>
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label>Chat model</label>
                    <select
                      value={agent?.llm?.openai?.chatModel || "gpt-4o-mini"}
                      onChange={(e) =>
                        setAgent((p) => ({
                          ...(p || {}),
                          llm: {
                            ...(p?.llm || {}),
                            openai: { ...(p?.llm?.openai || {}), chatModel: e.target.value }
                          }
                        }))
                      }
                    >
                      {OPENAI_CHAT_MODELS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Embedding model</label>
                    <select
                      value={agent?.llm?.openai?.embedModel || "text-embedding-3-small"}
                      onChange={(e) =>
                        setAgent((p) => ({
                          ...(p || {}),
                          llm: {
                            ...(p?.llm || {}),
                            openai: { ...(p?.llm?.openai || {}), embedModel: e.target.value }
                          }
                        }))
                      }
                    >
                      {OPENAI_EMBED_MODELS.map((m) => (
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
                  <label>Ollama base URL</label>
                  <input
                    value={agent?.llm?.ollama?.baseUrl || ""}
                    onChange={(e) =>
                      setAgent((p) => ({
                        ...(p || {}),
                        llm: { ...(p?.llm || {}), ollama: { ...(p?.llm?.ollama || {}), baseUrl: e.target.value } }
                      }))
                    }
                    placeholder="http://localhost:11434"
                  />
                  <div className="row" style={{ justifyContent: "flex-start", gap: 10, marginTop: 6 }}>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => loadOllamaModels(agent?.llm?.ollama?.baseUrl || "")}
                      disabled={ollamaModelsLoading}
                    >
                      {ollamaModelsLoading ? "Loading..." : "Refresh models"}
                    </button>
                    {ollamaModelsError ? <span style={{ color: "#b91c1c" }}>{ollamaModelsError}</span> : null}
                  </div>
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label>Chat model</label>
                    <select
                      value={agent?.llm?.ollama?.chatModel || ""}
                      onChange={(e) =>
                        setAgent((p) => ({
                          ...(p || {}),
                          llm: {
                            ...(p?.llm || {}),
                            ollama: { ...(p?.llm?.ollama || {}), chatModel: e.target.value }
                          }
                        }))
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
                        setAgent((p) => ({
                          ...(p || {}),
                          llm: {
                            ...(p?.llm || {}),
                            ollama: { ...(p?.llm?.ollama || {}), embedModel: e.target.value }
                          }
                        }))
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
                <div className="muted" style={{ fontSize: "0.9rem" }}>
                  Tip: you typically need a separate embedding model (e.g. <span className="chip">nomic-embed-text</span>) for Sync KB.
                </div>
              </div>
            )}

            <div className="divider" />
            <div className="title" style={{ fontSize: "1.1rem" }}>
              Trial & usage
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Free messages (trial)</label>
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={agent?.billing?.trialMessages ?? 5}
                  onChange={(e) =>
                    setAgent((p) => ({
                      ...(p || {}),
                      billing: { ...(p?.billing || {}), trialMessages: Number(e.target.value || 0) }
                    }))
                  }
                />
              </div>
              <div className="field">
                <label>Trial used</label>
                <input readOnly value={usage?.trial?.used ?? 0} />
              </div>
            </div>
            <div className="muted" style={{ fontSize: "0.9rem" }}>
              Total messages: {usage?.usage?.messagesTotal ?? 0}. Trial remaining: {usage?.trial?.remaining ?? "-"}
            </div>

            <div className="divider" />
            <div className="title" style={{ fontSize: "1.1rem" }}>
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
              <div className="field">
                <label>Primary color</label>
                <input
                  type="color"
                  value={agent?.theme?.primaryColor || "#0f172a"}
                  onChange={(e) => setAgent((p) => ({ ...(p || {}), theme: { ...(p?.theme || {}), primaryColor: e.target.value } }))}
                />
              </div>
              <div className="field">
                <label>Accent color</label>
                <input
                  type="color"
                  value={agent?.theme?.accentColor || "#38bdf8"}
                  onChange={(e) => setAgent((p) => ({ ...(p || {}), theme: { ...(p?.theme || {}), accentColor: e.target.value } }))}
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Border radius</label>
                <input
                  type="number"
                  min={8}
                  max={28}
                  value={agent?.theme?.borderRadius ?? 18}
                  onChange={(e) => setAgent((p) => ({ ...(p || {}), theme: { ...(p?.theme || {}), borderRadius: Number(e.target.value || 18) } }))}
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
            <div className="title" style={{ fontSize: "1.1rem" }}>
              Embed
            </div>
            <div className="field">
              <label>Embed script</label>
              <textarea readOnly value={embedCode} />
              <div className="muted" style={{ fontSize: "0.9rem" }}>
                Copy into any website HTML. It will render a chat widget.
              </div>
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
          </div>
        </div>

        <div className="card">
          <div className="card-pad" style={{ display: "grid", gap: 12 }}>
            <div className="title" style={{ fontSize: "1.1rem" }}>
              Knowledge base (DocSpace)
            </div>
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
                <input
                  type="checkbox"
                  checked={includeRoomRoot}
                  onChange={(e) => setIncludeRoomRoot(e.target.checked)}
                />
                <span>Index room root (files in the room itself)</span>
              </label>
            ) : null}
            {!selectedRoomId ? <div className="muted">Pick a room to select folders.</div> : null}

            <div className="divider" />
            <div className="title" style={{ fontSize: "1.1rem" }}>
              Select files
            </div>
            <div className="muted" style={{ fontSize: "0.9rem" }}>
              Preferred mode: pick specific files to index (no uploads).
            </div>

            {selectedFileIds?.length ? (
              <div className="muted" style={{ fontSize: "0.9rem" }}>
                Selected files: {selectedFileIds.length}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: "0.9rem" }}>
                No files selected. Sync KB will fall back to indexing selected folders/room root.
              </div>
            )}

            {kbBrowsePath?.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {kbBrowsePath.map((c, idx) => (
                  <button
                    key={c.id}
                    className="btn secondary sm"
                    type="button"
                    onClick={() => goToCrumb(idx)}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            ) : null}

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
                      <span>{f.title || `Folder ${f.id}`}</span>
                    </button>
                  ))}
                {(kbBrowseContents.items || [])
                  .filter((i) => i.type === "file")
                  .slice(0, 120)
                  .map((f) => (
                    <label key={f.id} className="chip" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={selectedFileIds.map(String).includes(String(f.id))}
                        onChange={() => toggleFile(f.id)}
                      />
                      <span>{f.title || `File ${f.id}`}</span>
                    </label>
                  ))}
              </div>
            ) : selectedRoomId ? (
              <div className="muted">Open the room to browse files.</div>
            ) : null}

            <div className="divider" />
            <div className="title" style={{ fontSize: "1.1rem" }}>
              KB status
            </div>
            <div className="muted" style={{ fontSize: "0.9rem" }}>
              Chunks: {kbStats?.chunks ?? 0} · Files: {kbStats?.fileCount ?? 0}
            </div>
            {(kbStats?.chunks ?? 0) === 0 ? (
              <div className="muted" style={{ fontSize: "0.9rem" }}>
                If this stays 0 after Sync KB, open “Last KB events” to see why files were skipped.
              </div>
            ) : null}
            <div className="row" style={{ justifyContent: "flex-start", gap: 10 }}>
              <button className="btn secondary" type="button" onClick={loadKbStats}>
                Refresh KB stats
              </button>
            </div>
            {(kbStats?.files || []).slice(0, 6).map((f) => (
              <div key={f.fileId} className="muted" style={{ fontSize: "0.9rem" }}>
                {f.fileTitle || "File"} · chunks: {f.chunks}
              </div>
            ))}
            {kbAudits?.length ? (
              <details>
                <summary className="muted">Last KB events</summary>
                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                  {kbAudits.map((a) => (
                    <div key={a.id} className="muted" style={{ fontSize: "0.85rem" }}>
                      <div>{a.event} · {a.createdAt}</div>
                      {a?.payload?.reason || a?.payload?.fileTitle || a?.payload?.fileId ? (
                        <div style={{ fontSize: "0.82rem" }}>
                          {a?.payload?.reason ? `reason=${a.payload.reason} ` : ""}
                          {a?.payload?.fileTitle ? `· ${a.payload.fileTitle} ` : ""}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            <div className="divider" />
            <div className="title" style={{ fontSize: "1.1rem" }}>
              KB test
            </div>
            <div className="row" style={{ alignItems: "stretch" }}>
              <input
                value={kbTestQuery}
                onChange={(e) => setKbTestQuery(e.target.value)}
                placeholder="Search query to verify retrieval..."
                style={{ flex: 1 }}
              />
              <button className="btn secondary" type="button" onClick={runKbTest}>
                Search
              </button>
            </div>
            {kbTestSnippets?.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {kbTestSnippets.slice(0, 4).map((s, idx) => (
                  <div key={`${s.fileId}-${idx}`} className="chip" style={{ alignItems: "flex-start" }}>
                    <div style={{ display: "grid", gap: 4 }}>
                      <div>
                        <strong>{s.fileTitle}</strong>
                      </div>
                      <div className="muted" style={{ fontSize: "0.9rem" }}>
                        {String(s.text || "").slice(0, 220)}...
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {folderContents?.items?.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div className="muted">Folders in selected room (pick the ones to index):</div>
                {(folderContents.items || [])
                  .filter((i) => i.type === "folder")
                  .slice(0, 60)
                  .map((f) => (
                    <label key={f.id} className="chip" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={selectedFolderIds.map(String).includes(String(f.id))}
                        onChange={() => toggleFolder(f.id)}
                      />
                      <span>{f.title || `Folder ${f.id}`}</span>
                    </label>
                  ))}
              </div>
            ) : selectedRoomId ? (
              <div className="muted">No folders loaded yet.</div>
            ) : null}

            <div className="divider" />
            <div className="title" style={{ fontSize: "1.1rem" }}>
              Preview
            </div>
            {agent?.publicId && agent?.embedKey ? (
              <ChatWidget
                publicId={agent.publicId}
                embedKey={agent.embedKey}
                height={"min(48vh, 520px)"}
                themeOverride={agent.theme || {}}
              />
            ) : (
              <div className="muted">Save the agent first to enable preview.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
