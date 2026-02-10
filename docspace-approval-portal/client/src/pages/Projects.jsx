import { useCallback, useEffect, useMemo, useState } from "react";
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
    if (!q) return list;
    return list.filter((p) => String(p.title || "").toLowerCase().includes(q));
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
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Projects</h2>
          <p className="muted">Create a project room, select it as current, then invite people.</p>
        </div>
        <div className="topbar-actions">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects..."
            disabled={busy || loading}
            style={{ maxWidth: 280 }}
          />
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

      <section className="stats-grid">
        <div className="stat-card">
          <span className="muted">Projects</span>
          <h3>{Array.isArray(projects) ? projects.length : 0}</h3>
          <p className="muted">Project rooms in this portal</p>
        </div>
        <div className="stat-card">
          <span className="muted">In progress</span>
          <h3>{counts.inProgress}</h3>
          <p className="muted">Requests started by you</p>
        </div>
        <div className="stat-card">
          <span className="muted">Total requests</span>
          <h3>{counts.total}</h3>
          <p className="muted">Across all projects</p>
        </div>
        <div className="stat-card">
          <span className="muted">Current</span>
          <h3>{activeRoomId ? 1 : 0}</h3>
          <p className="muted">{activeRoomId ? "Selected" : "Not selected"}</p>
        </div>
      </section>

      {!filtered.length ? (
        <section className="card">
          <div className="empty">
            <strong>No projects</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Create a project to get a DocSpace room for forms.
            </p>
            <div className="topbar-actions" style={{ marginTop: 10 }}>
              <button type="button" className="primary" onClick={() => setCreateOpen(true)} disabled={busy || loading}>
                Create project
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="card-header">
            <h3>Project rooms</h3>
            <p className="muted">Open a project to manage members and access.</p>
            <div className="row-actions" style={{ justifyContent: "space-between" }}>
              <button type="button" onClick={refresh} disabled={busy || loading}>
                Refresh
              </button>
              <span className="muted">Shown: {filtered.length}</span>
            </div>
          </div>

          <div className="project-grid">
            {filtered.map((p) => {
              const isCurrent = activeRoomId && String(p.roomId) === String(activeRoomId);
              const disabled = busy || loading;
              const canManage = Boolean(permissions?.[String(p.id)]);
              const actionsDisabled = disabled || !canManage;
              const inProgress = Number(p?.counts?.inProgress || 0);
              const total = Number(p?.counts?.total || 0);
              return (
                <div key={p.id} className="project-card">
                  <div className="project-card-head">
                    <div className="project-card-title">
                      <strong className="truncate">{p.title}</strong>
                      <span className="muted truncate">Room: {p.roomId}</span>
                    </div>
                    <div className="project-card-meta">
                      {isCurrent ? <StatusPill tone="green">Current</StatusPill> : null}
                    </div>
                  </div>

                  <div className="project-card-meta" style={{ justifyContent: "flex-start" }}>
                    {inProgress ? <StatusPill tone="yellow">{inProgress} in progress</StatusPill> : <StatusPill tone="gray">0 in progress</StatusPill>}{" "}
                    <StatusPill tone="gray">{total} total</StatusPill>
                  </div>

                  <div className="project-card-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => (typeof onOpenProject === "function" ? onOpenProject(p.id) : null)}
                      disabled={disabled}
                    >
                      Open
                    </button>
                    <button type="button" onClick={() => onSetCurrent(p)} disabled={disabled || isCurrent}>
                      {isCurrent ? "Selected" : "Make current"}
                    </button>
                    <button type="button" onClick={() => openInvite(p)} disabled={actionsDisabled}>
                      Invite
                    </button>
                    {p.roomUrl ? (
                      <a className="btn" href={p.roomUrl} target="_blank" rel="noreferrer">
                        DocSpace
                      </a>
                    ) : null}
                    <button type="button" className="danger" onClick={() => openDelete(p)} disabled={actionsDisabled}>
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
