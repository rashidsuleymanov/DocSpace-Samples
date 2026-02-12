import { useMemo, useState } from "react";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import EmptyState from "../components/EmptyState.jsx";
import StatusPill from "../components/StatusPill.jsx";
import { createBulkLinks } from "../services/portalApi.js";

function normalize(value) {
  return String(value || "").trim();
}

function isPdfFile(item) {
  const ext = String(item?.fileExst || "").trim().toLowerCase();
  const title = String(item?.title || "").trim().toLowerCase();
  return ext === "pdf" || ext === ".pdf" || title.endsWith(".pdf");
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
    } catch (e) {
      setError(e?.message || "Bulk links failed");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Bulk links</h2>
          <p className="muted">Generate multiple unique approval links from one template.</p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={() => onOpenRequests?.()} disabled={busy || actionBusy}>
            Open Requests
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setFlows([]);
              setError("");
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
            </div>
          </div>

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
                    {actionBusy ? "Working..." : "Generate links"}
                  </button>
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  Each link is a separate file copy in the project, so you can track them in Requests.
                </p>
              </div>
            </div>
          </div>

          {flows.length ? (
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

