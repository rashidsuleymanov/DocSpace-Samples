import { useEffect, useMemo, useState } from "react";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import Modal from "../components/Modal.jsx";
import StatusPill from "../components/StatusPill.jsx";

function isPdfTemplate(t) {
  const ext = String(t?.fileExst || "").trim().toLowerCase();
  const title = String(t?.title || "").trim().toLowerCase();
  return ext === "pdf" || ext === ".pdf" || title.endsWith(".pdf");
}

export default function Requests({
  session,
  busy,
  error,
  flows,
  activeRoomId,
  activeProject,
  projects = [],
  templates,
  initialFilter = "all",
  initialScope = "all",
  onBack,
  onStartFlow,
  onOpenDrafts,
  onOpenProjects
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(String(initialFilter || "all"));
  const [scope, setScope] = useState(String(initialScope || "all"));
  const [sendOpen, setSendOpen] = useState(false);
  const [sendQuery, setSendQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("Document");
  const [modalUrl, setModalUrl] = useState("");

  const hasProject = Boolean(String(activeRoomId || "").trim());
  const projectTitle = activeProject?.title || "";


  useEffect(() => {
    setStatusFilter(String(initialFilter || "all"));
  }, [initialFilter]);

  useEffect(() => {
    setScope(String(initialScope || "all"));
  }, [initialScope]);

  const filteredByScope = useMemo(() => {
    const items = Array.isArray(flows) ? flows : [];
    if (scope !== "current") return items;
    const rid = String(activeRoomId || "").trim();
    if (!rid) return [];
    return items.filter((f) => String(f?.projectRoomId || "") === rid);
  }, [activeRoomId, flows, scope]);

  const roomTitleById = useMemo(() => {
    const list = Array.isArray(projects) ? projects : [];
    const map = new Map();
    for (const p of list) {
      const rid = String(p?.roomId || "").trim();
      if (!rid) continue;
      map.set(rid, String(p?.title || "").trim() || "Project");
    }
    return map;
  }, [projects]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    const items = filteredByScope;
    const byStatus =
      statusFilter === "inProgress"
        ? items.filter((f) => f.status === "InProgress")
        : statusFilter === "completed"
          ? items.filter((f) => f.status === "Completed")
          : statusFilter === "other"
            ? items.filter((f) => f.status !== "InProgress" && f.status !== "Completed")
            : items;
    if (!q) return byStatus;
    return byStatus.filter((f) =>
      String(f.fileTitle || f.templateTitle || f.templateFileId || "")
        .toLowerCase()
        .includes(q)
    );
  }, [filteredByScope, query, statusFilter]);

  const templateItems = Array.isArray(templates) ? templates : [];
  const filteredSendTemplates = useMemo(() => {
    const q = String(sendQuery || "").trim().toLowerCase();
    const pdfOnly = templateItems.filter(isPdfTemplate);
    if (!q) return pdfOnly;
    return pdfOnly.filter((t) => String(t.title || t.id || "").toLowerCase().includes(q));
  }, [sendQuery, templateItems]);

  // Permissions are enforced server-side (user token).

  const openFlow = (flow) => {
    const url = String(flow?.openUrl || "").trim();
    if (!url) return;
    setModalTitle(flow?.fileTitle || flow?.templateTitle || "Document");
    setModalUrl(url);
    setModalOpen(true);
  };

  const onNewRequest = () => {
    if (!hasProject) {
      onOpenProjects();
      return;
    }
    setSendOpen(true);
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Requests</h2>
          <p className="muted">{hasProject ? `Current project: ${projectTitle || "-"}` : "Select a project to see requests."}</p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={onBack} disabled={busy}>
            Home
          </button>
          <button type="button" onClick={onOpenProjects} disabled={busy}>
            Projects
          </button>
          <button type="button" onClick={onOpenDrafts} disabled={busy}>
            Templates
          </button>
          <button type="button" className="primary" onClick={onNewRequest} disabled={busy}>
            {hasProject ? "New request" : "Choose project"}
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="card">
        <div className="card-header compact">
          <div>
            <h3>All requests</h3>
            <p className="muted">{scope === "current" ? "Filtered by the current project." : "Across all projects you can access."}</p>
          </div>
          <div className="card-header-actions">
            <select value={scope} onChange={(e) => setScope(e.target.value)} disabled={busy} style={{ maxWidth: 170 }}>
              <option value="all">All projects</option>
              <option value="current" disabled={!hasProject}>
                Current project
              </option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} disabled={busy} style={{ maxWidth: 160 }}>
              <option value="all">All</option>
              <option value="inProgress">In progress</option>
              <option value="completed">Completed</option>
              <option value="other">Other</option>
            </select>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title..."
              disabled={busy || (scope === "current" && !hasProject)}
              style={{ maxWidth: 260 }}
            />
            <span className="muted">Shown: {filtered.length}</span>
          </div>
        </div>

        <div className="list">
          {scope === "current" && !hasProject ? (
            <div className="empty">
              <strong>No project selected</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Pick a project to see its requests.
              </p>
              <div className="row-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
                <button type="button" className="primary" onClick={onOpenProjects} disabled={busy}>
                  Open Projects
                </button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <strong>No requests</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Create a request from a published template.
              </p>
            </div>
          ) : (
            filtered.map((flow) => (
              <div key={flow.id} className="list-row">
                <div className="list-main">
                  <strong>{flow.fileTitle || flow.templateTitle || `Template ${flow.templateFileId}`}</strong>
                  <span className="muted">
                    {flow.status === "InProgress" ? (
                      <StatusPill tone="yellow">In progress</StatusPill>
                    ) : flow.status === "Completed" ? (
                      <StatusPill tone="green">Completed</StatusPill>
                    ) : (
                      <StatusPill tone="gray">{flow.status || "-"}</StatusPill>
                    )}{" "}
                    {scope !== "current" ? (
                      <StatusPill tone="gray">
                        {(() => {
                          const rid = String(flow?.projectRoomId || "").trim();
                          if (!rid) return "Unassigned";
                          return roomTitleById.get(rid) || "Project";
                        })()}
                      </StatusPill>
                    ) : null}{" "}
                    Created: {(flow.createdAt || "").slice(0, 19).replace("T", " ")}
                  </span>
                </div>
                <div className="list-actions">
                  <button type="button" onClick={() => openFlow(flow)} disabled={!flow.openUrl || busy}>
                    Open
                  </button>
                  {flow.openUrl ? (
                    <a className="btn" href={flow.openUrl} target="_blank" rel="noreferrer">
                      New tab
                    </a>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <Modal
        open={sendOpen}
        title={projectTitle ? `New request — ${projectTitle}` : "New request"}
        onClose={() => setSendOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setSendOpen(false)} disabled={busy}>
              Close
            </button>
            <button type="button" className="link" onClick={onOpenDrafts} disabled={busy}>
              Templates
            </button>
          </>
        }
      >
        {!templateItems.length ? (
          <div className="empty" style={{ marginTop: 0 }}>
            <strong>No templates in this project</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Create templates in Templates and publish them to this project.
            </p>
          </div>
        ) : (
          <div className="auth-form" style={{ marginTop: 0 }}>
            <label>
              <span>Template</span>
              <input
                value={sendQuery}
                onChange={(e) => setSendQuery(e.target.value)}
                placeholder="Search templates..."
                disabled={busy}
              />
            </label>
            <div className="list" style={{ marginTop: 0 }}>
              {filteredSendTemplates.slice(0, 10).map((t) => (
                <div key={t.id} className="list-row">
                  <div className="list-main">
                    <strong className="truncate">{t.title || `File ${t.id}`}</strong>
                    <span className="muted truncate">ID: {t.id}</span>
                  </div>
                  <div className="list-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={async () => {
                        await onStartFlow(t.id);
                        setSendOpen(false);
                        setSendQuery("");
                      }}
                      disabled={busy}
                    >
                      Create request
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <DocSpaceModal open={modalOpen} title={modalTitle} url={modalUrl} onClose={() => setModalOpen(false)} />
    </div>
  );
}
