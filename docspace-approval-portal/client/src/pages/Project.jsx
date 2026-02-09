import { useEffect, useMemo, useState } from "react";
import Modal from "../components/Modal.jsx";
import StatusPill from "../components/StatusPill.jsx";
import { activateProject, getProjectMembers, getProjectsSidebar, inviteProject, listTemplates, removeProjectMember } from "../services/portalApi.js";

function normalize(value) {
  return String(value || "").trim();
}

function accessLabel(value) {
  if (typeof value === "number") {
    if (value === 0) return "No access";
    if (value === 1) return "Project viewer";
    if (value === 2) return "Project editor";
    if (value === 3) return "Project reviewer";
    if (value === 4) return "Project commenter";
    if (value === 5) return "Form respondent";
    if (value === 6) return "Form author";
    if (value >= 7) return "Project admin";
    return `Access ${value}`;
  }
  const v = String(value || "").toLowerCase();
  if (v === "fillforms") return "Form respondent";
  if (v === "readwrite") return "Project editor";
  if (v === "roommanager") return "Project admin";
  if (v === "read") return "Project viewer";
  return value || "-";
}

function isPdfTemplate(t) {
  const ext = String(t?.fileExst || "").trim().toLowerCase();
  const title = String(t?.title || "").trim().toLowerCase();
  return ext === "pdf" || ext === ".pdf" || title.endsWith(".pdf");
}

export default function Project({ session, busy, projectId, onBack, onStartFlow, onOpenDrafts }) {
  const token = session?.token || "";
  const meId = session?.user?.id ? String(session.user.id) : "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [templates, setTemplates] = useState([]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({
    emails: "",
    access: "FillForms",
    notify: false,
    message: ""
  });
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeEntry, setRemoveEntry] = useState(null);

  const refresh = async () => {
    const pid = normalize(projectId);
    if (!pid) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const [sidebarRes, membersRes] = await Promise.all([
        getProjectsSidebar({ token }).catch(() => null),
        getProjectMembers({ token, projectId: pid })
      ]);
      const list = Array.isArray(sidebarRes?.projects) ? sidebarRes.projects : [];
      const found = list.find((p) => String(p.id) === pid) || null;
      setProject(found || membersRes?.project || null);
      setMembers(Array.isArray(membersRes?.members) ? membersRes.members : []);

      if (found?.id) {
        await activateProject(found.id).catch(() => null);
        window.dispatchEvent(new CustomEvent("portal:projectChanged"));
      }

      if (token) {
        const templatesRes = await listTemplates({ token }).catch(() => null);
        setTemplates(Array.isArray(templatesRes?.templates) ? templatesRes.templates : []);
      } else {
        setTemplates([]);
      }
    } catch (e) {
      setError(e?.message || "Failed to load project");
      setProject(null);
      setMembers([]);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);

  const normalizedMembers = useMemo(() => {
    const items = Array.isArray(members) ? members : [];
    return items
      .map((m) => ({
        key: m?.user?.id || m?.group?.id || JSON.stringify(m || {}),
        userId: m?.user?.id ? String(m.user.id) : "",
        type: m?.user?.id ? "user" : m?.group?.id ? "group" : String(m?.subjectType || "other"),
        title: m?.user?.displayName || m?.group?.name || "Unknown",
        subtitle: m?.user?.email || "",
        access: m?.access || null,
        isOwner: Boolean(m?.isOwner),
        canRevoke: Boolean(m?.canRevoke)
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [members]);

  const canManageProject = useMemo(() => {
    if (!meId) return false;
    const items = Array.isArray(members) ? members : [];
    const me =
      items.find((m) => m?.user?.id && String(m.user.id) === meId) ||
      null;
    if (!me) return false;
    if (me?.isOwner) return true;
    if (typeof me?.access === "number") return me.access >= 7;
    const access = String(me?.access || "").toLowerCase();
    if (/^\\d+$/.test(access)) return Number(access) >= 7;
    return access === "roommanager" || access === "roomadmin";
  }, [members, meId]);

  const onInvite = async () => {
    const pid = normalize(project?.id);
    const emails = normalize(invite.emails);
    if (!pid || !emails) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await inviteProject({
        token,
        projectId: pid,
        emails,
        access: invite.access,
        notify: invite.notify,
        message: invite.message
      });
      setInviteOpen(false);
      setInvite((s) => ({ ...s, emails: "", message: "" }));
      setNotice(`Invited ${data?.invited || 0} user(s).`);
      await refresh();
    } catch (e) {
      setError(e?.message || "Invite failed");
    } finally {
      setLoading(false);
    }
  };

  const onOpenRemove = (member) => {
    setRemoveEntry(member || null);
    setRemoveOpen(true);
    setError("");
    setNotice("");
  };

  const onRemove = async () => {
    const pid = normalize(project?.id);
    const uid = normalize(removeEntry?.userId);
    if (!pid || !uid) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await removeProjectMember({ token, projectId: pid, userId: uid });
      setRemoveOpen(false);
      setRemoveEntry(null);
      setNotice("Member removed.");
      await refresh();
    } catch (e) {
      setError(e?.message || "Remove failed");
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = useMemo(() => {
    const items = Array.isArray(templates) ? templates : [];
    return items.filter(isPdfTemplate);
  }, [templates]);

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>{project?.title || "Project"}</h2>
          <p className="muted">Members and access are managed on the DocSpace room.</p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={onBack} disabled={busy || loading}>
            Back
          </button>
          {typeof onOpenDrafts === "function" ? (
            <button type="button" onClick={onOpenDrafts} disabled={busy || loading}>
              Templates
            </button>
          ) : null}
          <button type="button" onClick={refresh} disabled={busy || loading}>
            Refresh
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => setInviteOpen(true)}
            disabled={busy || loading || !project?.id || !canManageProject}
          >
            Invite people
          </button>
          {project?.roomUrl ? (
            <a className="link" href={project.roomUrl} target="_blank" rel="noreferrer">
              Open in DocSpace
            </a>
          ) : null}
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <section className="card">
        <div className="card-header">
          <h3>People</h3>
          <p className="muted">Members and roles are managed on the DocSpace room.</p>
        </div>

        <div className="list">
          {!normalizedMembers.length ? (
            <div className="empty">
              <strong>No members data</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Invite someone or open the room to manage access in DocSpace.
              </p>
            </div>
          ) : (
            normalizedMembers.map((m) => (
              <div key={m.key} className="list-row">
                <div className="list-main">
                  <strong className="truncate">{m.title}</strong>
                  <span className="muted truncate">
                    {m.subtitle ? `${m.subtitle} - ` : ""}
                    <StatusPill tone={m.isOwner ? "green" : "gray"}>{m.isOwner ? "Project admin" : accessLabel(m.access)}</StatusPill>
                  </span>
                </div>
                <div className="list-actions">
                  {m.type === "user" && !m.isOwner ? (
                    <button
                      type="button"
                      className="danger"
                      onClick={() => onOpenRemove(m)}
                      disabled={busy || loading || !canManageProject || !m.canRevoke || m.userId === meId}
                      title={!canManageProject ? "Only the room admin can remove members" : !m.canRevoke ? "No permission to remove this member" : ""}
                    >
                      Remove
                    </button>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {m.type}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h3>Forms</h3>
          <p className="muted">Forms available in this project.</p>
        </div>

        <div className="list">
          {!filteredTemplates.length ? (
            <div className="empty">
              <strong>No forms found</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Publish a template to this project to make it available here.
              </p>
              {typeof onOpenDrafts === "function" ? (
                <div className="row-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
                  <button type="button" className="primary" onClick={onOpenDrafts} disabled={busy || loading}>
                    Open Templates
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            filteredTemplates.map((t) => (
              <div key={t.id} className="list-row">
                <div className="list-main">
                  <strong className="truncate">{t.title || `File ${t.id}`}</strong>
                  <span className="muted truncate">
                    <StatusPill tone={t.isForm ? "green" : "gray"}>{t.isForm ? "Form" : "File"}</StatusPill> ID: {t.id}
                    {t.fileExst ? ` - ${t.fileExst}` : ""}
                  </span>
                </div>
                <div className="list-actions">
                  <button type="button" className="primary" onClick={() => onStartFlow(t.id)} disabled={busy || loading || !token}>
                    Create request
                  </button>
                  {t.webUrl ? (
                    <a className="btn" href={t.webUrl} target="_blank" rel="noreferrer">
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
        open={inviteOpen}
        title={project?.title ? `Invite to ${project.title}` : "Invite"}
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
              disabled={busy || loading || !normalize(invite.emails) || !project?.id || !canManageProject}
            >
              {loading ? "Working..." : "Send invites"}
            </button>
          </>
        }
      >
        {!canManageProject ? (
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
          <label>
            <span>
              <input type="checkbox" checked={Boolean(invite.notify)} onChange={(e) => setInvite((s) => ({ ...s, notify: e.target.checked }))} />{" "}
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
        open={removeOpen}
        title={removeEntry?.title ? `Remove ${removeEntry.title}?` : "Remove member?"}
        onClose={() => {
          if (loading) return;
          setRemoveOpen(false);
        }}
        footer={
          <>
            <button type="button" onClick={() => setRemoveOpen(false)} disabled={busy || loading}>
              Cancel
            </button>
            <button type="button" className="danger" onClick={onRemove} disabled={busy || loading || !removeEntry?.userId || !canManageProject}>
              {loading ? "Working..." : "Remove"}
            </button>
          </>
        }
      >
        <div className="empty" style={{ marginTop: 0 }}>
          <strong>This revokes access to the DocSpace room.</strong>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            The user can be re-invited later.
          </p>
        </div>
      </Modal>
    </div>
  );
}
