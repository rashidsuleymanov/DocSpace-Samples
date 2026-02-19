import { useEffect, useMemo, useState } from "react";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import EmptyState from "../components/EmptyState.jsx";
import StatusPill from "../components/StatusPill.jsx";
import { createBulkLinks } from "../services/portalApi.js";
import { deleteBulkBatch, listBulkBatches, restoreBulkBatch, saveBulkBatch, trashBulkBatch } from "../services/bulkHistoryStore.js";
import { saveLocalDraft } from "../services/draftsStore.js";
import { toast } from "../utils/toast.js";

function normalize(value) {
  return String(value || "").trim();
}

function isPdfFile(item) {
  const ext = String(item?.fileExst || "").trim().toLowerCase();
  const title = String(item?.title || "").trim().toLowerCase();
  return ext === "pdf" || ext === ".pdf" || title.endsWith(".pdf");
}

function csvEscape(value) {
  const v = String(value ?? "");
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function downloadCsv(filename, rows) {
  const content = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([`\ufeff${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function BulkLinks({ session, busy, activeRoomId, activeProject, templates = [], onOpenRequests }) {
  const token = normalize(session?.token);
  const hasProject = Boolean(normalize(activeRoomId)) && Boolean(activeProject?.id);
  const projectTitle = String(activeProject?.title || "").trim() || "Current project";

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [count, setCount] = useState(10);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [flows, setFlows] = useState([]);
  const [draftId, setDraftId] = useState("");
  const [view, setView] = useState("create"); // create | history | trash
  const [historyTick, setHistoryTick] = useState(0);

  const [docOpen, setDocOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("Document");
  const [docUrl, setDocUrl] = useState("");

  const templateItems = useMemo(() => {
    const list = Array.isArray(templates) ? templates : [];
    const onlyPdf = list.filter((t) => isPdfFile(t));
    const q = normalize(query).toLowerCase();
    const items = q ? onlyPdf.filter((t) => String(t?.title || "").toLowerCase().includes(q)) : onlyPdf;
    items.sort((a, b) => String(a?.title || "").localeCompare(String(b?.title || "")));
    return items;
  }, [query, templates]);

  const historyItems = useMemo(() => {
    return listBulkBatches(session, "bulkLinks", { includeTrashed: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyTick, session]);

  const activeHistory = useMemo(() => historyItems.filter((b) => !b.trashedAt), [historyItems]);
  const trashedHistory = useMemo(() => historyItems.filter((b) => Boolean(b.trashedAt)), [historyItems]);

  const selectedTemplate = useMemo(() => {
    const id = normalize(selectedId);
    if (!id) return null;
    return templateItems.find((t) => String(t?.id) === id) || null;
  }, [selectedId, templateItems]);

  const openDoc = (flow) => {
    const url = normalize(flow?.openUrl);
    if (!url) return;
    setDocTitle(String(flow?.fileTitle || flow?.templateTitle || "Document"));
    setDocUrl(url);
    setDocOpen(true);
  };

  const copy = async (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied", "success");
    } catch {
      // ignore
    }
  };

  const run = async () => {
    if (!token) return;
    setError("");
    if (!hasProject) {
      setError("Select a project in the sidebar first.");
      return;
    }
    if (!selectedTemplate?.id) {
      setError("Select a template first.");
      return;
    }
    const n = Math.max(1, Math.min(50, Number(count) || 1));

    setActionBusy(true);
    try {
      const res = await createBulkLinks({
        token,
        templateFileId: String(selectedTemplate.id),
        projectId: String(activeProject?.id || ""),
        count: n
      });
      const next = Array.isArray(res?.flows) ? res.flows : [];
      setFlows(next);
      window.dispatchEvent(new CustomEvent("portal:projectChanged"));
      if (next.length) {
        const title = `${String(selectedTemplate?.title || "Bulk links").trim()} - ${next.length} link(s)`;
        saveBulkBatch(session, "bulkLinks", {
          type: "bulkLinks",
          title,
          payload: {
            projectId: String(activeProject?.id || ""),
            projectTitle: String(activeProject?.title || ""),
            templateId: String(selectedTemplate?.id || ""),
            templateTitle: String(selectedTemplate?.title || ""),
            count: next.length,
            links: next.map((f) => normalize(f?.openUrl)).filter(Boolean),
            flowIds: next.map((f) => String(f?.id || "").trim()).filter(Boolean)
          }
        });
        setHistoryTick((v) => v + 1);
      }
      toast(next.length ? `Generated ${next.length} link(s)` : "No links generated", next.length ? "success" : "info");
    } catch (e) {
      setError(e?.message || "Bulk links failed");
    } finally {
      setActionBusy(false);
    }
  };

  const saveDraft = () => {
    const template = selectedTemplate || templateItems.find((t) => String(t?.id) === String(selectedId)) || null;
    const title = `${String(template?.title || "Bulk links").trim()} (links)`.trim();
    const saved = saveLocalDraft(session, {
      id: draftId || "",
      type: "bulkLinks",
      title,
      payload: {
        templateId: String(selectedId || ""),
        templateTitle: String(template?.title || ""),
        count: Number(count) || 10
      }
    });
    setDraftId(saved?.id || "");
  };

  useEffect(() => {
    const handler = (evt) => {
      const payload = evt?.detail?.payload || null;
      if (!payload || typeof payload !== "object") return;
      setSelectedId(String(payload.templateId || ""));
      setCount(Number(payload.count) || 10);
      setDraftId(String(payload.draftId || ""));
      setError("");
    };
    window.addEventListener("portal:bulkLinksLoadDraft", handler);
    return () => window.removeEventListener("portal:bulkLinksLoadDraft", handler);
  }, []);

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Bulk links</h2>
          <p className="muted">Generate multiple unique approval links from one template.</p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={() => setView("create")} disabled={busy || actionBusy}>
            Create
          </button>
          <button type="button" onClick={() => setView("history")} disabled={busy || actionBusy}>
            History
          </button>
          <button type="button" onClick={() => setView("trash")} disabled={busy || actionBusy}>
            Trash
          </button>
          <button type="button" onClick={() => onOpenRequests?.()} disabled={busy || actionBusy}>
            Open Requests
          </button>
          <button type="button" onClick={saveDraft} disabled={busy || actionBusy || !selectedId}>
            Save draft
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setFlows([]);
              setError("");
              setDraftId("");
            }}
            disabled={busy || actionBusy}
          >
            Clear
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {!hasProject ? (
        <section className="card">
          <EmptyState title="Select a project first" description="Pick a project in the left sidebar. Links are created inside the current project (including Personal workspace)." />
        </section>
      ) : (
        <section className="card">
          <div className="card-header compact">
            <div>
              <h3>{projectTitle}</h3>
              <p className="muted">These links can be shared with anyone.</p>
            </div>
            <div className="card-header-actions">
              <span className="muted">{flows.length ? `${flows.length} link(s)` : ""}</span>
              {flows.length ? (
                <button
                  type="button"
                  onClick={() => {
                    const links = flows.map((f) => normalize(f?.openUrl)).filter(Boolean);
                    copy(links.join("\n"));
                  }}
                  disabled={busy || actionBusy}
                >
                  Copy links
                </button>
              ) : null}
              {flows.length ? (
                <button
                  type="button"
                  onClick={() => {
                    const rows = [
                      ["title", "status", "link"],
                      ...flows.map((f) => [
                        String(f?.fileTitle || f?.templateTitle || "Link"),
                        String(f?.status || "InProgress"),
                        String(f?.openUrl || "")
                      ])
                    ];
                    downloadCsv("bulk-links.csv", rows);
                  }}
                  disabled={busy || actionBusy}
                >
                  Export CSV
                </button>
              ) : null}
            </div>
          </div>

          {view !== "create" ? (
            <div className="list">
              {(view === "history" ? activeHistory : trashedHistory).length === 0 ? (
                <EmptyState
                  title={view === "trash" ? "Trash is empty" : "No batches yet"}
                  description={view === "trash" ? "Move batches to trash to hide them." : "Generate links to see them here."}
                />
              ) : (
                (view === "history" ? activeHistory : trashedHistory).map((b) => {
                  const payload = b.payload || {};
                  const links = Array.isArray(payload.links) ? payload.links : [];
                  const updated = String(b.updatedAt || b.createdAt || "").slice(0, 19).replace("T", " ");
                  return (
                    <div key={b.id} className="list-row request-row">
                      <div className="list-main">
                        <strong className="truncate">{b.title}</strong>
                        <span className="muted request-row-meta">
                          <StatusPill tone="gray">Bulk links</StatusPill>{" "}
                          {payload.projectTitle ? <StatusPill tone="gray">{String(payload.projectTitle)}</StatusPill> : null}{" "}
                          {payload.count ? <StatusPill tone="gray">{`${Number(payload.count) || links.length} link(s)`}</StatusPill> : null}{" "}
                          <span className="muted">Saved {updated || "-"}</span>
                        </span>
                      </div>
                      <div className="list-actions">
                        <button type="button" onClick={() => copy(links.join("\n"))} disabled={busy || actionBusy || links.length === 0}>
                          Copy links
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const rows = [
                              ["title", "status", "link"],
                              ...links.map((l) => [String(payload.templateTitle || "Link"), "InProgress", String(l || "")])
                            ];
                            downloadCsv("bulk-links.csv", rows);
                          }}
                          disabled={busy || actionBusy || links.length === 0}
                        >
                          Export CSV
                        </button>
                        {view === "trash" ? (
                          <button
                            type="button"
                            className="primary"
                            onClick={() => {
                              restoreBulkBatch(session, "bulkLinks", b.id);
                              setHistoryTick((v) => v + 1);
                            }}
                            disabled={busy || actionBusy}
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              trashBulkBatch(session, "bulkLinks", b.id);
                              setHistoryTick((v) => v + 1);
                            }}
                            disabled={busy || actionBusy}
                          >
                            Trash
                          </button>
                        )}
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            const ok = typeof window !== "undefined" ? window.confirm("Delete this batch permanently?") : true;
                            if (!ok) return;
                            deleteBulkBatch(session, "bulkLinks", b.id);
                            setHistoryTick((v) => v + 1);
                          }}
                          disabled={busy || actionBusy}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
          <div className="wizard">
            <div className="wizard-section">
              <div className="wizard-head">
                <strong>1) Choose template</strong>
                <span className="muted">{selectedTemplate?.title ? "Selected" : "Pick a PDF template"}</span>
              </div>
              <div className="auth-form" style={{ marginTop: 0 }}>
                <label>
                  <span>Search</span>
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates..." disabled={busy || actionBusy} />
                </label>
              </div>

              {!templateItems.length ? (
                <EmptyState title="No templates found" description="Publish a PDF form template to this project first." />
              ) : (
                <div className="select-list">
                  {templateItems.slice(0, 10).map((t) => {
                    const selected = String(selectedId) === String(t.id);
                    return (
                      <button key={t.id} type="button" className={`select-row${selected ? " is-selected" : ""}`} onClick={() => setSelectedId(String(t.id))} disabled={busy || actionBusy}>
                        <div className="select-row-main">
                          <strong className="truncate">{t.title || `File ${t.id}`}</strong>
                        </div>
                        <span className="select-row-right" aria-hidden="true">
                          {selected ? "Selected" : ">"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="wizard-divider" />

            <div className="wizard-section">
              <div className="wizard-head">
                <strong>2) How many links</strong>
                <span className="muted">1 to 50</span>
              </div>
              <div className="auth-form" style={{ marginTop: 0 }}>
                <label>
                  <span>Count</span>
                  <input type="number" min="1" max="50" value={count} onChange={(e) => setCount(e.target.value)} disabled={busy || actionBusy} />
                </label>
                <div className="row-actions">
                  <button type="button" className="primary" onClick={run} disabled={busy || actionBusy || !selectedTemplate?.id}>
                    {actionBusy ? "Loading..." : "Generate links"}
                  </button>
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  Each link is a separate file copy in the project, so you can track them in Requests.
                </p>
              </div>
            </div>
          </div>
          )}

          {view === "create" && flows.length ? (
            <div className="list" style={{ marginTop: 16 }}>
              {flows.map((flow) => {
                const openUrl = normalize(flow?.openUrl);
                return (
                  <div key={String(flow?.id || openUrl)} className="list-row request-row">
                    <div className="list-main">
                      <strong className="truncate">{flow?.fileTitle || flow?.templateTitle || "Link"}</strong>
                      <span className="muted request-row-meta">
                        <StatusPill tone="yellow">In progress</StatusPill>{" "}
                        <StatusPill tone="gray">Approval link</StatusPill>
                      </span>
                    </div>
                    <div className="list-actions">
                      <button type="button" className="primary" onClick={() => openDoc(flow)} disabled={busy || actionBusy || !openUrl}>
                        Open
                      </button>
                      <button type="button" onClick={() => copy(openUrl)} disabled={busy || actionBusy || !openUrl}>
                        Copy link
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      )}

      <DocSpaceModal open={docOpen} title={docTitle} url={docUrl} onClose={() => setDocOpen(false)} />
    </div>
  );
}
