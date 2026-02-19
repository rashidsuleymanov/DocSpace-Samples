import { useCallback, useEffect, useMemo, useState } from "react";
import ContextMenu from "../components/ContextMenu.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Modal from "../components/Modal.jsx";
import StatusPill from "../components/StatusPill.jsx";
import { toast } from "../utils/toast.js";
import {
  activateProject,
  archiveProject,
  createProject,
  deleteProject,
  getProjectsPermissions,
  getProjectsList,
  inviteProject,
  unarchiveProject
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
  const [tab, setTab] = useState("active"); // active | archived

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");

  const [actionsProjectEntry, setActionsProjectEntry] = useState(null);
  const [actionsAnchorEl, setActionsAnchorEl] = useState(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);

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

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveEntry, setArchiveEntry] = useState(null);
  const [archiveWarnOpen, setArchiveWarnOpen] = useState(false);
  const [archiveOpenRequests, setArchiveOpenRequests] = useState(0);

  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreEntry, setRestoreEntry] = useState(null);
  const [setCurrentOpen, setSetCurrentOpen] = useState(false);
  const [setCurrentEntry, setSetCurrentEntry] = useState(null);

  const filtered = useMemo(() => {
    const q = normalizeTitle(query).toLowerCase();
    const list = Array.isArray(projects) ? projects : [];
    const scoped = tab === "archived" ? list.filter((p) => Boolean(p?.archivedAt)) : list.filter((p) => !p?.archivedAt);
    const items = q ? scoped.filter((p) => String(p.title || "").toLowerCase().includes(q)) : scoped.slice();
    items.sort((a, b) => {
      const aCur = activeRoomId && String(a?.roomId || "") === String(activeRoomId);
      const bCur = activeRoomId && String(b?.roomId || "") === String(activeRoomId);
      if (aCur !== bCur) return aCur ? -1 : 1;
      return String(a?.title || "").localeCompare(String(b?.title || ""));
    });
    return items;
  }, [activeRoomId, projects, query, tab]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await getProjectsList({ token });
      const list = Array.isArray(res?.projects) ? res.projects : [];
      setProjects(list);
      setActiveRoomId(res?.activeRoomId || null);
      const totals = list
        .filter((p) => !p?.archivedAt)
        .reduce(
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

      return { activeRoomId: res?.activeRoomId || null, projects: list };
    } catch (e) {
      setError(e?.message || "Failed to load projects");
      return { activeRoomId: null, projects: [] };
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

  useEffect(() => {
    const onCreate = () => setCreateOpen(true);
    window.addEventListener("portal:projectsCreate", onCreate);
    return () => window.removeEventListener("portal:projectsCreate", onCreate);
  }, []);

  const onSetCurrent = async (project) => {
    if (!project?.id) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await activateProject(project.id);
      setActiveRoomId(result?.activeRoomId || project.roomId || null);
      setNotice("Current project changed.");
      toast("Current project changed", "success");
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
    setActionsMenuOpen(true);
    setError("");
    setNotice("");
  };

  const closeActions = () => {
    setActionsMenuOpen(false);
    setActionsAnchorEl(null);
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
      toast("Invites sent", "success");
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
      toast("Project created", "success");
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

  const openArchive = (project) => {
    setArchiveEntry(project || null);
    setArchiveOpen(true);
    setArchiveWarnOpen(false);
    setArchiveOpenRequests(0);
    setError("");
    setNotice("");
  };

  const openRestore = (project) => {
    setRestoreEntry(project || null);
    setRestoreOpen(true);
    setError("");
    setNotice("");
  };

 	  const doArchive = async ({ cancelOpenRequests } = {}) => {
 	    const project = archiveEntry;
 	    if (!project?.id) return;
 	    setLoading(true);
 	    setError("");
 	    setNotice("");
 	    try {
 	      const res = await archiveProject({ token, projectId: project.id, cancelOpenRequests: Boolean(cancelOpenRequests) });
 	      setArchiveOpen(false);
 	      setArchiveWarnOpen(false);
 	      setArchiveEntry(null);
 	      setArchiveOpenRequests(0);
 	      await refresh();
 	      setNotice(res?.warning ? `Project archived. ${res.warning}` : "Project archived.");
        toast("Project archived", "success");
 	      window.dispatchEvent(new CustomEvent("portal:projectChanged"));
 	    } catch (e) {
 	      if (e?.status === 409 && typeof e?.details?.openRequests === "number") {
 	        setArchiveOpen(false);
         setArchiveOpenRequests(Number(e.details.openRequests) || 0);
         setArchiveWarnOpen(true);
       } else {
         setError(e?.message || "Archive failed");
       }
     } finally {
       setLoading(false);
     }
   };

  const doRestore = async () => {
    const project = restoreEntry;
    if (!project?.id) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await unarchiveProject({ token, projectId: project.id });
      setRestoreOpen(false);
      setRestoreEntry(null);
      const refreshed = await refresh();
      setNotice("Project restored.");
      toast("Project restored", "success");
      window.dispatchEvent(new CustomEvent("portal:projectChanged"));
      if (!refreshed?.activeRoomId) {
        setSetCurrentEntry(project);
        setSetCurrentOpen(true);
      }
    } catch (e) {
      setError(e?.message || "Restore failed");
    } finally {
      setLoading(false);
    }
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
      toast("Project removed", "success");
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

      <div className="chip-row" aria-label="Project list mode" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className={`chip${tab === "active" ? " is-active" : ""}`}
          onClick={() => setTab("active")}
          disabled={busy || loading}
        >
          Active
        </button>
        <button
          type="button"
          className={`chip${tab === "archived" ? " is-active" : ""}`}
          onClick={() => setTab("archived")}
          disabled={busy || loading}
        >
          Archived
        </button>
      </div>

      {!filtered.length ? (
        <section className="card">
          <EmptyState
            title={normalizeTitle(query) ? "Nothing found" : tab === "archived" ? "No archived projects" : "No projects yet"}
            description={
              normalizeTitle(query)
                ? `No projects match "${normalizeTitle(query)}".`
                : tab === "archived"
                ? "Archived projects will appear here after you archive them."
                : "Create a project to publish templates and start approval requests."
            }
            actions={
              normalizeTitle(query) ? (
                <button type="button" onClick={() => setQuery("")} disabled={busy || loading}>
                  Clear search
                </button>
              ) : tab === "archived" ? (
                <button type="button" onClick={() => setTab("active")} disabled={busy || loading}>
                  View active projects
                </button>
              ) : (
                <button type="button" className="primary" onClick={() => setCreateOpen(true)} disabled={busy || loading}>
                  Create project
                </button>
              )
            }
          />
        </section>
      ) : (
        <section className="card">
          <div className="card-header compact">
            <div>
              <h3>{tab === "archived" ? "Archived projects" : "Project rooms"}</h3>
              <p className="muted">
                {tab === "archived" ? "Restore archived projects when you need them again." : "Open a project to manage members, templates, and requests."}
              </p>
            </div>
            <div className="card-header-actions">
              <span className="muted">{filtered.length} shown</span>
            </div>
          </div>

          <div className="projects-kpis" aria-label="Projects summary">
            <div className="projects-kpi">
              <span className="muted">Projects</span>
              <strong>
                {Array.isArray(projects)
                  ? projects.filter((p) => (tab === "archived" ? p?.archivedAt : !p?.archivedAt)).length
                  : 0}
              </strong>
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

          <div className="projects-grid" aria-label="Projects grid">
            {filtered.map((p) => {
              const isCurrent = activeRoomId && String(p.roomId) === String(activeRoomId);
              const disabled = busy || loading;
              const canManage = Boolean(permissions?.[String(p.id)]);
              const inProgress = Number(p?.counts?.inProgress || 0);
              const total = Number(p?.counts?.total || 0);
              const isArchived = Boolean(p?.archivedAt);
              return (
                <div key={p.id} className={`project-card${isCurrent ? " is-current" : ""}${isArchived ? " is-archived" : ""}`}>
                  <button
                    type="button"
                    className="project-card-main"
                    onClick={() => (typeof onOpenProject === "function" ? onOpenProject(p.id) : null)}
                    disabled={disabled || isArchived}
                    title={isArchived ? "Restore this project to open it." : "Open project"}
                  >
                    <div className="project-card-title-row">
                      <strong className="truncate">{p.title || "Untitled"}</strong>
                      <span className="project-card-badges" aria-hidden="true">
                        {isCurrent ? <StatusPill tone="green">Current</StatusPill> : null}
                        {isArchived ? <StatusPill tone="gray">Archived</StatusPill> : null}
                        {canManage ? <StatusPill tone="blue">Admin</StatusPill> : <StatusPill tone="gray">Member</StatusPill>}
                      </span>
                    </div>

                    <div className="project-card-metrics" aria-label="Request counts">
                      <div className="project-metric">
                        <span className="muted">In progress</span>
                        <strong>{inProgress}</strong>
                      </div>
                      <div className="project-metric">
                        <span className="muted">Total</span>
                        <strong>{total}</strong>
                      </div>
                    </div>

                    {isArchived && p?.archivedAt ? (
                      <div className="project-card-footnote muted">
                        Archived {String(p.archivedAt).slice(0, 10)}
                        {p?.archivedByName ? ` by ${p.archivedByName}` : ""}
                      </div>
                    ) : null}
                  </button>

                  <div className="project-card-actions" aria-label="Project actions">
                    {!isArchived ? (
                      <button type="button" onClick={() => onSetCurrent(p)} disabled={disabled || isCurrent}>
                        {isCurrent ? "Current" : "Set current"}
                      </button>
                    ) : (
                      <button type="button" onClick={() => openRestore(p)} disabled={disabled || !canManage}>
                        Restore
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-button projects-more"
                      onClick={(e) => {
                        setActionsProjectEntry(p);
                        setActionsAnchorEl(e.currentTarget);
                        openActions(p);
                      }}
                      disabled={disabled}
                      aria-label="More actions"
                      title="More actions"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <ContextMenu
        open={actionsMenuOpen}
        anchorEl={actionsAnchorEl}
        onClose={() => {
          if (loading) return;
          closeActions();
          setActionsProjectEntry(null);
        }}
        ariaLabel="Project actions"
      >
        {(() => {
          const p = actionsProjectEntry;
          if (!p?.id) return null;
          const isCurrent = activeRoomId && String(p.roomId) === String(activeRoomId);
          const canManage = Boolean(permissions?.[String(p.id)]);
          const disabled = busy || loading;
          const isArchived = Boolean(p?.archivedAt);
          return (
            <div className="modal-actions">
              <div className="action-list" role="menu" aria-label="Project actions">
                {isArchived ? (
                  <button
                    type="button"
                    className="action-item primary"
                    onClick={() => {
                      closeActions();
                      setActionsProjectEntry(null);
                      openRestore(p);
                    }}
                    disabled={disabled || !canManage}
                    role="menuitem"
                  >
                    <div className="action-item-text">
                      <strong>Restore project</strong>
                      <span className="muted">{canManage ? "Bring this project back to active." : "Only the project admin can restore."}</span>
                    </div>
                    <span className="action-item-right" aria-hidden="true">&gt;</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  className="action-item primary"
                  onClick={() => {
                    closeActions();
                    setActionsProjectEntry(null);
                    if (typeof onOpenProject === "function") onOpenProject(p.id);
                  }}
                  disabled={disabled || isArchived}
                  role="menuitem"
                >
                  <div className="action-item-text">
                    <strong>Open project</strong>
                    <span className="muted">Manage people and forms.</span>
                  </div>
                  <span className="action-item-right" aria-hidden="true">&gt;</span>
                </button>

                <button
                  type="button"
                  className={`action-item${isCurrent ? " is-disabled" : ""}`}
                  onClick={async () => {
                    closeActions();
                    setActionsProjectEntry(null);
                    await onSetCurrent(p);
                  }}
                  disabled={disabled || isCurrent || isArchived}
                  role="menuitem"
                >
                  <div className="action-item-text">
                    <strong>{isCurrent ? "Current project" : "Set as current"}</strong>
                    <span className="muted">{isCurrent ? "This project is already selected." : "Use this project for new requests."}</span>
                  </div>
                  <span className="action-item-right" aria-hidden="true">{isCurrent ? "Current" : ">"}</span>
                </button>

                <button
                  type="button"
                  className="action-item"
                  onClick={() => {
                    closeActions();
                    setActionsProjectEntry(null);
                    openInvite(p);
                  }}
                  disabled={disabled || !canManage || isArchived}
                  role="menuitem"
                >
                  <div className="action-item-text">
                    <strong>Invite people</strong>
                    <span className="muted">{canManage ? "Add people to this project." : "Only the project admin can invite."}</span>
                  </div>
                  <span className="action-item-right" aria-hidden="true">&gt;</span>
                </button>

                {!isArchived ? (
                  <button
                    type="button"
                    className="action-item"
                    onClick={() => {
                      closeActions();
                      setActionsProjectEntry(null);
                      openArchive(p);
                    }}
                    disabled={disabled || !canManage}
                    role="menuitem"
                  >
                    <div className="action-item-text">
                      <strong>Archive project</strong>
                      <span className="muted">{canManage ? "Moves DocSpace rooms to archive." : "Only the project admin can archive."}</span>
                    </div>
                    <span className="action-item-right" aria-hidden="true">&gt;</span>
                  </button>
                ) : null}

                {p.roomUrl ? (
                  <a className="action-item" href={p.roomUrl} target="_blank" rel="noreferrer" role="menuitem">
                    <div className="action-item-text">
                      <strong>Open in DocSpace</strong>
                      <span className="muted">Manage the room and permissions.</span>
                    </div>
                    <span className="action-item-right" aria-hidden="true">New tab</span>
                  </a>
                ) : null}

                <button
                  type="button"
                  className="action-item danger"
                  onClick={() => {
                    closeActions();
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
                  <span className="action-item-right" aria-hidden="true">&gt;</span>
                </button>
              </div>
            </div>
          );
        })()}
      </ContextMenu>

      <Modal
        open={archiveOpen}
        title={archiveEntry?.title ? `Archive ${archiveEntry.title}?` : "Archive project?"}
        onClose={() => {
          if (loading) return;
          setArchiveOpen(false);
        }}
        footer={
          <>
            <button type="button" onClick={() => setArchiveOpen(false)} disabled={busy || loading}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => doArchive({ cancelOpenRequests: false })}
              disabled={busy || loading || !archiveEntry?.id || !permissions?.[String(archiveEntry?.id || "")]}
            >
              {loading ? "Loading..." : "Archive"}
            </button>
          </>
        }
      >
        {!permissions?.[String(archiveEntry?.id || "")] ? (
          <p className="muted" style={{ margin: "0 0 10px" }}>
            Only the room admin can archive projects.
          </p>
        ) : null}
        <div className="empty" style={{ marginTop: 0 }}>
          <strong>This archives the related DocSpace rooms.</strong>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            If the project has open requests, you will be asked to cancel them first.
          </p>
        </div>
      </Modal>

      <Modal
        open={archiveWarnOpen}
        title="Archive project with open requests?"
        onClose={() => {
          if (loading) return;
          setArchiveWarnOpen(false);
        }}
        footer={
          <>
            <button type="button" onClick={() => setArchiveWarnOpen(false)} disabled={busy || loading}>
              Keep active
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => doArchive({ cancelOpenRequests: true })}
              disabled={busy || loading || !archiveEntry?.id || !permissions?.[String(archiveEntry?.id || "")]}
            >
              {loading ? "Loading..." : "Archive and cancel requests"}
            </button>
          </>
        }
      >
        <div className="empty" style={{ marginTop: 0 }}>
          <strong>{archiveOpenRequests || "Some"} request(s) are still open.</strong>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Archiving will cancel open requests in the portal and move the related DocSpace rooms to archive.
          </p>
        </div>
      </Modal>

      <Modal
        open={restoreOpen}
        title={restoreEntry?.title ? `Restore ${restoreEntry.title}?` : "Restore project?"}
        onClose={() => {
          if (loading) return;
          setRestoreOpen(false);
        }}
        footer={
          <>
            <button type="button" onClick={() => setRestoreOpen(false)} disabled={busy || loading}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={doRestore}
              disabled={busy || loading || !restoreEntry?.id || !permissions?.[String(restoreEntry?.id || "")]}
            >
              {loading ? "Loading..." : "Restore"}
            </button>
          </>
        }
      >
        {!permissions?.[String(restoreEntry?.id || "")] ? (
          <p className="muted" style={{ margin: "0 0 10px" }}>
            Only the room admin can restore projects.
          </p>
        ) : null}
        <div className="empty" style={{ marginTop: 0 }}>
          <strong>This restores the related DocSpace rooms from archive.</strong>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            You can set it as the current project afterwards.
          </p>
        </div>
      </Modal>

      <Modal
        open={setCurrentOpen}
        title="Set as current project?"
        onClose={() => {
          setSetCurrentOpen(false);
          setSetCurrentEntry(null);
        }}
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setSetCurrentOpen(false);
                setSetCurrentEntry(null);
              }}
              disabled={busy || loading}
            >
              Not now
            </button>
            <button
              type="button"
              className="primary"
              onClick={async () => {
                const p = setCurrentEntry;
                setSetCurrentOpen(false);
                setSetCurrentEntry(null);
                await onSetCurrent(p);
              }}
              disabled={busy || loading || !setCurrentEntry?.id}
            >
              Set as current
            </button>
          </>
        }
      >
        <div className="empty" style={{ marginTop: 0 }}>
          <strong>No current project is selected.</strong>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Setting a current project makes it the default target for new requests.
          </p>
        </div>
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
              {loading ? "Loading..." : "Create"}
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
              {loading ? "Loading..." : "Send invites"}
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
              <option value="FillForms">Form respondent</option>
              <option value="Read">Project viewer</option>
              <option value="ReadWrite">Project editor</option>
              <option value="RoomManager">Project admin</option>
            </select>
          </label>
          <p className="muted" style={{ marginTop: 0 }}>
            {invite.access === "RoomManager"
              ? "Admins can invite people and cancel requests."
              : invite.access === "ReadWrite"
                ? "Editors can work with files in DocSpace (if allowed by the room)."
                : invite.access === "Read"
                  ? "Viewers can open project files and track requests."
                  : "Respondents can fill forms and complete requests assigned to them."}
          </p>
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
              {loading ? "Loading..." : "Delete"}
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
