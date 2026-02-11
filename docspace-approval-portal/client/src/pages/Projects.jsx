import { useCallback, useEffect, useMemo, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import Modal from "../components/Modal.jsx";
import StatusPill from "../components/StatusPill.jsx";
import {
  activateProject,
  createProject,
  deleteProject,
  getProjectsPermissions,
  getProjectsSidebar,
  inviteProject,
} from "../services/portalApi.js";

function normalizeTitle(value) {
  return String(value || "").trim();
}

export default function Projects({ session, busy, onOpenProject, onOpenDrafts }) {
  const token = session?.token || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [projects, setProjects] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [query, setQuery] = useState("");
  const [counts, setCounts] = useState({ total: 0, inProgress: 0 });

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");

  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsProjectEntry, setActionsProjectEntry] = useState(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteProjectEntry, setInviteProjectEntry] = useState(null);
  const [invite, setInvite] = useState({
    emails: "",
    access: "FillForms",
    notify: false,
    message: ""
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState(null);

  const filtered = useMemo(() => {
    const q = normalizeTitle(query).toLowerCase();
    const list = Array.isArray(projects) ? projects : [];
    const items = q ? list.filter((p) => String(p.title || "").toLowerCase().includes(q)) : list.slice();
    items.sort((a, b) => {
      const aCur = activeRoomId && String(a?.roomId || "") === String(activeRoomId);
      const bCur = activeRoomId && String(b?.roomId || "") === String(activeRoomId);
      if (aCur !== bCur) return aCur ? -1 : 1;
      return String(a?.title || "").localeCompare(String(b?.title || ""));
    });
    return items;
  }, [projects, query]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const sidebar = await getProjectsSidebar({ token });
      const list = Array.isArray(sidebar?.projects) ? sidebar.projects : [];
      setProjects(list);
      setActiveRoomId(sidebar?.activeRoomId || null);
      const totals = list.reduce(
        (acc, p) => {
          acc.total += Number(p?.counts?.total || 0);
          acc.inProgress += Number(p?.counts?.inProgress || 0);
          return acc;
        },
        { total: 0, inProgress: 0 }
      );
      setCounts(totals);

      if (token) {
        const perms = await getProjectsPermissions({ token }).catch(() => null);
        setPermissions(perms?.permissions && typeof perms.permissions === "object" ? perms.permissions : {});
      } else {
        setPermissions({});
      }
    } catch (e) {
      setError(e?.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, token]);

  useEffect(() => {
    refresh().catch(() => null);
    const handler = () => refresh().catch(() => null);
    window.addEventListener("portal:projectChanged", handler);
    return () => window.removeEventListener("portal:projectChanged", handler);
  }, [refresh]);

  const onSetCurrent = async (project) => {
    if (!project?.id) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await activateProject(project.id);
      setActiveRoomId(result?.activeRoomId || project.roomId || null);
      setNotice("Current project changed.");
      window.dispatchEvent(new CustomEvent("portal:projectChanged"));
    } catch (e) {
      setError(e?.message || "Failed to switch project");
    } finally {
      setLoading(false);
    }
  };

  const openInvite = (project) => {
    setInviteProjectEntry(project || null);
    setInvite((s) => ({ ...s, emails: "", message: "" }));
    setInviteOpen(true);
    setError("");
    setNotice("");
  };

  const openActions = (project) => {
    setActionsProjectEntry(project || null);
    setActionsOpen(true);
    setError("");
    setNotice("");
  };

  const onInvite = async () => {
    const project = inviteProjectEntry;
    const emails = normalizeTitle(invite.emails);
    if (!project?.id || !emails) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await inviteProject({
        token,
        projectId: project.id,
        emails,
        access: invite.access,
        notify: invite.notify,
        message: invite.message
      });
      setInviteOpen(false);
      setNotice(`Invited ${data?.invited || 0} user(s).`);
    } catch (e) {
      setError(e?.message || "Invite failed");
    } finally {
      setLoading(false);
    }
  };

  const onCreate = async () => {
    const title = normalizeTitle(createTitle);
    if (!title) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await createProject({ token, title });
      setCreateOpen(false);
      setCreateTitle("");
      await refresh();
      setNotice("Project created and set as current.");
      window.dispatchEvent(new CustomEvent("portal:projectChanged"));
    } catch (e) {
      setError(e?.message || "Create failed");
    } finally {
      setLoading(false);
    }
  };

  const openDelete = (project) => {
    setDeleteEntry(project || null);
    setDeleteOpen(true);
    setError("");
    setNotice("");
  };

  const onDelete = async () => {
    const project = deleteEntry;
    if (!project?.id) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await deleteProject({ token, projectId: project.id });
      setDeleteOpen(false);
      setDeleteEntry(null);
      await refresh();
      setNotice("Project removed from portal list.");
      window.dispatchEvent(new CustomEvent("portal:projectChanged"));
    } catch (e) {
      setError(e?.message || "Delete failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell projects-page">
      <header className="topbar">
        <div>
          <h2>Projects</h2>
          <p className="muted">Create a project room, select it as current, then invite people.</p>
        </div>
        <div className="topbar-actions projects-topbar-actions">
          <input
            className="projects-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects..."
            disabled={busy || loading}
          />
          <button type="button" onClick={refresh} disabled={busy || loading}>
            Refresh
          </button>
          {typeof onOpenDrafts === "function" ? (
            <button type="button" onClick={onOpenDrafts} disabled={busy || loading}>
              Templates
            </button>
          ) : null}
          <button type="button" className="primary" onClick={() => setCreateOpen(true)} disabled={busy || loading}>
            New project
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      {!filtered.length ? (
        <section className="card">
          <EmptyState
            title="No projects yet"
            description="Create a project to publish templates and start approval requests."
            actions={
              <button type="button" className="primary" onClick={() => setCreateOpen(true)} disabled={busy || loading}>
                Create project
              </button>
            }
          />
        </section>
      ) : (
        <section className="card">
          <div className="card-header compact">
            <div>
              <h3>Project rooms</h3>
              <p className="muted">Open a project to manage members, templates, and requests.</p>
            </div>
            <div className="card-header-actions">
              <span className="muted">{filtered.length} shown</span>
            </div>
          </div>

          <div className="projects-kpis" aria-label="Projects summary">
            <div className="projects-kpi">
              <span className="muted">Projects</span>
              <strong>{Array.isArray(projects) ? projects.length : 0}</strong>
            </div>
            <div className="projects-kpi">
              <span className="muted">In progress</span>
              <strong>{counts.inProgress}</strong>
            </div>
            <div className="projects-kpi">
              <span className="muted">Total requests</span>
              <strong>{counts.total}</strong>
            </div>
            <div className="projects-kpi">
              <span className="muted">Current</span>
              <strong>{activeRoomId ? "Selected" : "None"}</strong>
            </div>
          </div>

          <div className="projects-room-list">
            {filtered.map((p) => {
              const isCurrent = activeRoomId && String(p.roomId) === String(activeRoomId);
              const disabled = busy || loading;
              const canManage = Boolean(permissions?.[String(p.id)]);
              const inProgress = Number(p?.counts?.inProgress || 0);
              const total = Number(p?.counts?.total || 0);
              return (
                <div key={p.id} className={`project-tile${isCurrent ? " is-current" : ""}`}>
                  <div className="project-tile-main">
                    <div className="project-tile-title-row">
                      <strong className="truncate">{p.title || "Untitled"}</strong>
                      {isCurrent ? <StatusPill tone="green">Current</StatusPill> : null}
                      {!canManage ? <StatusPill tone="gray">View-only</StatusPill> : null}
                    </div>
                    <div className="project-tile-meta">
                      <StatusPill tone={inProgress ? "yellow" : "gray"}>{inProgress} in progress</StatusPill>
                      <StatusPill tone="gray">{total} total</StatusPill>
                    </div>
                  </div>

                  <div className="project-tile-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => (typeof onOpenProject === "function" ? onOpenProject(p.id) : null)}
                      disabled={disabled}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="icon-button projects-more"
                      onClick={() => openActions(p)}
                      disabled={disabled}
                      aria-label="More actions"
                      title="More actions"
                    >
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path
                          d="M5 10a1.6 1.6 0 1 1-3.2 0A1.6 1.6 0 0 1 5 10Zm6.6 0a1.6 1.6 0 1 1-3.2 0a1.6 1.6 0 0 1 3.2 0Zm6.6 0a1.6 1.6 0 1 1-3.2 0a1.6 1.6 0 0 1 3.2 0Z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Modal
        open={actionsOpen}
        title={actionsProjectEntry?.title ? `${actionsProjectEntry.title}` : "Project"}
        size="sm"
        onClose={() => {
          if (loading) return;
          setActionsOpen(false);
          setActionsProjectEntry(null);
        }}
      >
        {(() => {
          const p = actionsProjectEntry;
          if (!p?.id) return null;
          const isCurrent = activeRoomId && String(p.roomId) === String(activeRoomId);
          const canManage = Boolean(permissions?.[String(p.id)]);
          const disabled = busy || loading;
          return (
            <div className="modal-actions">
              <div className="action-list" role="menu" aria-label="Project actions">
                <button
                  type="button"
                  className="action-item primary"
                  onClick={() => {
                    setActionsOpen(false);
                    setActionsProjectEntry(null);
                    if (typeof onOpenProject === "function") onOpenProject(p.id);
                  }}
                  disabled={disabled}
                  role="menuitem"
                >
                  <div className="action-item-text">
                    <strong>Open project</strong>
                    <span className="muted">Manage people and forms.</span>
                  </div>
                  <span className="action-item-right" aria-hidden="true">›</span>
                </button>

                <button
                  type="button"
                  className={`action-item${isCurrent ? " is-disabled" : ""}`}
                  onClick={async () => {
                    setActionsOpen(false);
                    setActionsProjectEntry(null);
                    await onSetCurrent(p);
                  }}
                  disabled={disabled || isCurrent}
                  role="menuitem"
                >
                  <div className="action-item-text">
                    <strong>{isCurrent ? "Current project" : "Set as current"}</strong>
                    <span className="muted">{isCurrent ? "This project is already selected." : "Use this project for new requests."}</span>
                  </div>
                  <span className="action-item-right" aria-hidden="true">{isCurrent ? "✓" : "›"}</span>
                </button>

                <button
                  type="button"
                  className="action-item"
                  onClick={() => {
                    setActionsOpen(false);
                    setActionsProjectEntry(null);
                    openInvite(p);
                  }}
                  disabled={disabled || !canManage}
                  role="menuitem"
                >
                  <div className="action-item-text">
                    <strong>Invite people</strong>
                    <span className="muted">{canManage ? "Add people to this project." : "Only the project admin can invite."}</span>
                  </div>
                  <span className="action-item-right" aria-hidden="true">›</span>
                </button>

                {p.roomUrl ? (
                  <a className="action-item" href={p.roomUrl} target="_blank" rel="noreferrer" role="menuitem">
                    <div className="action-item-text">
                      <strong>Open in DocSpace</strong>
                      <span className="muted">Manage the room and permissions.</span>
                    </div>
                    <span className="action-item-right" aria-hidden="true">↗</span>
                  </a>
                ) : null}

                <button
                  type="button"
                  className="action-item danger"
                  onClick={() => {
                    setActionsOpen(false);
                    setActionsProjectEntry(null);
                    openDelete(p);
                  }}
                  disabled={disabled || !canManage}
                  role="menuitem"
                >
                  <div className="action-item-text">
                    <strong>Remove from portal</strong>
                    <span className="muted">{canManage ? "This does not delete the DocSpace room." : "Only the project admin can remove."}</span>
                  </div>
                  <span className="action-item-right" aria-hidden="true">›</span>
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal
        open={createOpen}
        title="Create project"
        onClose={() => {
          if (loading) return;
          setCreateOpen(false);
        }}
        footer={
          <>
            <button type="button" onClick={() => setCreateOpen(false)} disabled={busy || loading}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={onCreate} disabled={busy || loading || !normalizeTitle(createTitle)}>
              {loading ? "Working..." : "Create"}
            </button>
          </>
        }
      >
        <form className="auth-form" onSubmit={(e) => e.preventDefault()} style={{ marginTop: 0 }}>
          <label>
            <span>Project name</span>
            <input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} disabled={busy || loading} />
          </label>
          <p className="muted" style={{ margin: 0 }}>
            Creates a new DocSpace room and makes it active.
          </p>
        </form>
      </Modal>

      <Modal
        open={inviteOpen}
        title={inviteProjectEntry?.title ? `Invite to ${inviteProjectEntry.title}` : "Invite"}
        onClose={() => {
          if (loading) return;
          setInviteOpen(false);
        }}
        footer={
          <>
            <button type="button" onClick={() => setInviteOpen(false)} disabled={busy || loading}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={onInvite}
              disabled={busy || loading || !inviteProjectEntry?.id || !normalizeTitle(invite.emails) || !permissions?.[String(inviteProjectEntry?.id || "")]}
            >
              {loading ? "Working..." : "Send invites"}
            </button>
          </>
        }
      >
        {!permissions?.[String(inviteProjectEntry?.id || "")] ? (
          <p className="muted" style={{ margin: "0 0 10px" }}>
            Only the room admin can invite people to this project.
          </p>
        ) : null}
        <form className="auth-form" onSubmit={(e) => e.preventDefault()} style={{ marginTop: 0 }}>
          <label>
            <span>Emails (comma / new line)</span>
            <textarea value={invite.emails} onChange={(e) => setInvite((s) => ({ ...s, emails: e.target.value }))} />
          </label>
          <label>
            <span>Role</span>
            <select value={invite.access} onChange={(e) => setInvite((s) => ({ ...s, access: e.target.value }))}>
              <option value="FillForms">Fill forms</option>
              <option value="Read">Read</option>
              <option value="ReadWrite">Read & write</option>
              <option value="RoomManager">Room manager</option>
            </select>
          </label>
          <label>
            <span>
              <input
                type="checkbox"
                checked={Boolean(invite.notify)}
                onChange={(e) => setInvite((s) => ({ ...s, notify: e.target.checked }))}
              />{" "}
              Send notifications
            </span>
          </label>
          <label>
            <span>Message (optional)</span>
            <input value={invite.message} onChange={(e) => setInvite((s) => ({ ...s, message: e.target.value }))} />
          </label>
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        title={deleteEntry?.title ? `Delete ${deleteEntry.title}?` : "Delete project?"}
        onClose={() => {
          if (loading) return;
          setDeleteOpen(false);
        }}
        footer={
          <>
            <button type="button" onClick={() => setDeleteOpen(false)} disabled={busy || loading}>
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              onClick={onDelete}
              disabled={busy || loading || !deleteEntry?.id || !permissions?.[String(deleteEntry?.id || "")]}
            >
              {loading ? "Working..." : "Delete"}
            </button>
          </>
        }
      >
        {!permissions?.[String(deleteEntry?.id || "")] ? (
          <p className="muted" style={{ margin: "0 0 10px" }}>
            Only the room admin can remove projects.
          </p>
        ) : null}
        <div className="empty" style={{ marginTop: 0 }}>
          <strong>This only removes the project from the portal list.</strong>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            The DocSpace room itself is not deleted.
          </p>
        </div>
      </Modal>
    </div>
  );
}
