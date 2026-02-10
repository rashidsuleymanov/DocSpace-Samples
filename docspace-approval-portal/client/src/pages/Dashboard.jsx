import { useMemo, useState } from "react";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import Modal from "../components/Modal.jsx";
import QuickActions from "../components/QuickActions.jsx";
import StatCard from "../components/StatCard.jsx";
import StatusPill from "../components/StatusPill.jsx";

function isPdfTemplate(t) {
  const ext = String(t?.fileExst || "").trim().toLowerCase();
  const title = String(t?.title || "").trim().toLowerCase();
  return ext === "pdf" || ext === ".pdf" || title.endsWith(".pdf");
}

export default function Dashboard({
  session,
  busy,
  error,
  flows,
  activeRoomId,
  activeProject,
  projectsCount = 0,
  projects = [],
  templates,
  draftsPdfCount = 0,
  onRefresh,
  onStartFlow,
  onOpenDrafts,
  onOpenProjects,
  onOpenRequests,
  onOpenProject
}) {
  const userLabel = session?.user?.displayName || session?.user?.email || "DocSpace user";

  const hasCurrentProject = Boolean(String(activeRoomId || "").trim());
  const currentProjectTitle = activeProject?.title || "";
  const currentProjectUrl = activeProject?.roomUrl ? String(activeProject.roomUrl) : "";
  const currentProjectId = activeProject?.id ? String(activeProject.id) : "";

  const allFlows = useMemo(() => (Array.isArray(flows) ? flows : []), [flows]);

  const stats = useMemo(() => {
    const inProgress = allFlows.filter((f) => f.status === "InProgress").length;
    const completed = allFlows.filter((f) => f.status === "Completed").length;
    const other = allFlows.length - inProgress - completed;
    return { total: allFlows.length, inProgress, completed, other };
  }, [allFlows]);

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

  const recentRequests = useMemo(() => {
    const sorted = [...allFlows].sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
    return sorted.slice(0, 5);
  }, [allFlows]);

  const pdfTemplateCount = useMemo(() => {
    const list = Array.isArray(templates) ? templates : [];
    return list.filter(isPdfTemplate).length;
  }, [templates]);

  const [sendOpen, setSendOpen] = useState(false);
  const [sendQuery, setSendQuery] = useState("");
  const templateItems = Array.isArray(templates) ? templates : [];
  const filteredSendTemplates = useMemo(() => {
    const q = String(sendQuery || "").trim().toLowerCase();
    const pdfOnly = templateItems.filter(isPdfTemplate);
    if (!q) return pdfOnly;
    return pdfOnly.filter((t) => String(t.title || t.id || "").toLowerCase().includes(q));
  }, [sendQuery, templateItems]);

  const [docOpen, setDocOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("Document");
  const [docUrl, setDocUrl] = useState("");

  const openFlow = (flow) => {
    const url = String(flow?.openUrl || "").trim();
    if (!url) return;
    setDocTitle(flow?.fileTitle || flow?.templateTitle || "Document");
    setDocUrl(url);
    setDocOpen(true);
  };

  const openRequests = (filter = "all") => {
    if (typeof onOpenRequests !== "function") return;
    onOpenRequests(filter, "all");
  };

  const onNewRequest = () => {
    if (!hasCurrentProject) {
      onOpenProjects();
      return;
    }
    setSendOpen(true);
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Home</h2>
          <p className="muted">
            Signed in as {userLabel}
            {hasCurrentProject && currentProjectTitle ? ` — Current project: ${currentProjectTitle}` : ""}
          </p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={onRefresh} disabled={busy}>
            Refresh
          </button>
          {hasCurrentProject && currentProjectUrl ? (
            <a className="btn subtle" href={currentProjectUrl} target="_blank" rel="noreferrer">
              Open in DocSpace
            </a>
          ) : null}
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="stats-grid">
            <StatCard title="Projects" value={projectsCount} meta="Project rooms you can access" onClick={onOpenProjects} />
            <StatCard title="Templates" value={draftsPdfCount} meta="PDF templates in My documents" onClick={onOpenDrafts} />
            <StatCard title="In progress" value={stats.inProgress} meta="Requests across all projects" onClick={() => openRequests("inProgress")} />
            <StatCard title="Completed" value={stats.completed} meta="Requests across all projects" onClick={() => openRequests("completed")} />
            <StatCard title="Total" value={stats.total} meta="Requests across all projects" onClick={() => openRequests("all")} />
          </section>

          <section className="card">
            <div className="card-header compact">
              <div>
                <h3>Recent requests</h3>
                <p className="muted">Latest requests across all projects.</p>
              </div>
              <div className="card-header-actions">
                <button type="button" onClick={() => openRequests("all")} disabled={busy}>
                  View all
                </button>
              </div>
            </div>

            <div className="list">
              {!recentRequests.length ? (
                <div className="empty">
                  <strong>No requests yet</strong>
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    Select a project and create your first request from a published template.
                  </p>
                </div>
              ) : (
                recentRequests.map((flow) => {
                  const roomId = String(flow?.projectRoomId || "").trim();
                  const roomTitle = roomId ? roomTitleById.get(roomId) || "Project" : "Unassigned";
                  return (
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
                          <StatusPill tone="gray">{roomTitle}</StatusPill>{" "}
                          {(flow.createdAt || "").slice(0, 19).replace("T", " ")}
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
                  );
                })
              )}
            </div>
          </section>
        </div>

        <div className="dashboard-side">
          <div className="quick-actions">
            <QuickActions
              hasProject={hasCurrentProject}
              projectTitle={currentProjectTitle}
              onOpenProjects={onOpenProjects}
              onOpenTemplates={onOpenDrafts}
              onNewRequest={onNewRequest}
              onOpenCurrentProject={
                typeof onOpenProject === "function" && currentProjectId ? () => onOpenProject(currentProjectId) : null
              }
            />
          </div>
          <section className="card compact">
            <div className="card-header compact">
              <div>
                <h3>Current project</h3>
                <p className="muted">Used for publishing templates and creating requests.</p>
              </div>
              <div className="card-header-actions">
                <button type="button" onClick={onOpenProjects} disabled={busy}>
                  Change
                </button>
              </div>
            </div>
            {hasCurrentProject ? (
              <div className="list" style={{ marginTop: 10 }}>
                <div className="list-row">
                  <div className="list-main">
                    <strong className="truncate">{currentProjectTitle || "Untitled"}</strong>
                    <span className="muted truncate">
                      <StatusPill tone="green">Current</StatusPill>{" "}
                      {pdfTemplateCount ? (
                        <StatusPill tone="gray">{pdfTemplateCount} published template(s)</StatusPill>
                      ) : (
                        <StatusPill tone="gray">No published templates</StatusPill>
                      )}
                    </span>
                  </div>
                  <div className="list-actions">
                    {typeof onOpenProject === "function" && currentProjectId ? (
                      <button type="button" className="primary" onClick={() => onOpenProject(currentProjectId)} disabled={busy}>
                        Open
                      </button>
                    ) : null}
                    {currentProjectUrl ? (
                      <a className="btn" href={currentProjectUrl} target="_blank" rel="noreferrer">
                        DocSpace
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty" style={{ marginTop: 10 }}>
                <strong>No project selected</strong>
                <p className="muted" style={{ margin: "6px 0 0" }}>
                  Pick a project to publish templates and create requests.
                </p>
                <div className="row-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
                  <button type="button" className="primary" onClick={onOpenProjects} disabled={busy}>
                    Open Projects
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <Modal
        open={sendOpen}
        title={currentProjectTitle ? `New request — ${currentProjectTitle}` : "New request"}
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
            <strong>No templates in the current project</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Open Templates and publish a PDF form to the current project.
            </p>
          </div>
        ) : (
          <div className="auth-form" style={{ marginTop: 0 }}>
            <label>
              <span>Template</span>
              <input value={sendQuery} onChange={(e) => setSendQuery(e.target.value)} placeholder="Search templates..." disabled={busy} />
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

      <DocSpaceModal open={docOpen} title={docTitle} url={docUrl} onClose={() => setDocOpen(false)} />
    </div>
  );
}
