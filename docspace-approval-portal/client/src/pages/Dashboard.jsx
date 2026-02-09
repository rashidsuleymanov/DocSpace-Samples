import { useEffect, useMemo, useState } from "react";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import Modal from "../components/Modal.jsx";
import StatCard from "../components/StatCard.jsx";
import StatusPill from "../components/StatusPill.jsx";
import StepsCard from "../components/StepsCard.jsx";
import { getProjectMembers, inviteProject, removeProjectMember } from "../services/portalApi.js";

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
  if (v === "deny") return "No access";
  return value || "-";
}

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
  templates,
  onRefresh,
  onStartFlow,
  onOpenDrafts,
  onOpenProjects
}) {
  const [open, setOpen] = useState(false);
  const [modalUrl, setModalUrl] = useState("");
  const [modalTitle, setModalTitle] = useState("Document");
  const [query, setQuery] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendQuery, setSendQuery] = useState("");

  const token = session?.token || "";
  const meId = session?.user?.id ? String(session.user.id) : "";
  const projectId = activeProject?.id ? String(activeProject.id) : "";

  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [membersNotice, setMembersNotice] = useState("");
  const [members, setMembers] = useState([]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({
    emails: "",
    access: "FillForms",
    notify: false,
    message: ""
  });

  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeEntry, setRemoveEntry] = useState(null);

  const filteredByProject = useMemo(() => {
    const rid = String(activeRoomId || "").trim();
    const items = Array.isArray(flows) ? flows : [];
    if (!rid) return [];
    return items.filter((f) => String(f?.projectRoomId || "") === rid);
  }, [activeRoomId, flows]);

  const unassignedCount = useMemo(() => {
    const items = Array.isArray(flows) ? flows : [];
    return items.filter((f) => !String(f?.projectRoomId || "").trim()).length;
  }, [flows]);

  const stats = useMemo(() => {
    const items = filteredByProject;
    const inProgress = items.filter((f) => f.status === "InProgress").length;
    const completed = items.filter((f) => f.status === "Completed").length;
    const other = items.length - inProgress - completed;
    return { total: items.length, inProgress, completed, other };
  }, [filteredByProject]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    const items = filteredByProject;
    if (!q) return items;
    return items.filter((f) =>
      String(f.fileTitle || f.templateTitle || f.templateFileId || "")
        .toLowerCase()
        .includes(q)
    );
  }, [filteredByProject, query]);

  const openFlow = (flow) => {
    const url = String(flow?.openUrl || "").trim();
    if (!url) return;
    setModalTitle(flow?.fileTitle || flow?.templateTitle || "Document");
    setModalUrl(url);
    setOpen(true);
  };

  const userLabel = session?.user?.displayName || session?.user?.email || "DocSpace user";
  const hasProject = Boolean(String(activeRoomId || "").trim());
  const projectTitle = activeProject?.title || "";
  const projectUrl = activeProject?.roomUrl ? String(activeProject.roomUrl) : "";
  const templateItems = Array.isArray(templates) ? templates : [];
  const filteredSendTemplates = useMemo(() => {
    const q = String(sendQuery || "").trim().toLowerCase();
    const pdfOnly = templateItems.filter(isPdfTemplate);
    if (!q) return pdfOnly;
    return pdfOnly.filter((t) => String(t.title || t.id || "").toLowerCase().includes(q));
  }, [sendQuery, templateItems]);

  const onPrimaryAction = () => {
    if (!hasProject) {
      onOpenProjects();
      return;
    }
    setSendOpen(true);
  };

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
    const me = items.find((m) => m?.user?.id && String(m.user.id) === meId) || null;
    if (!me) return false;
    if (me?.isOwner) return true;
    if (typeof me?.access === "number") return me.access >= 7;
    const access = String(me?.access || "").toLowerCase();
    if (/^\\d+$/.test(access)) return Number(access) >= 7;
    return access === "roommanager" || access === "roomadmin";
  }, [members, meId]);

  const refreshMembers = async () => {
    if (!hasProject || !projectId || !token) {
      setMembers([]);
      setMembersError("");
      return;
    }
    setMembersLoading(true);
    setMembersError("");
    try {
      const data = await getProjectMembers({ token, projectId });
      setMembers(Array.isArray(data?.members) ? data.members : []);
    } catch (e) {
      setMembers([]);
      setMembersError(e?.message || "Failed to load members");
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    refreshMembers().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProject, projectId, token]);

  const onInvite = async () => {
    const emails = normalize(invite.emails);
    if (!token || !projectId || !emails) return;
    setMembersLoading(true);
    setMembersError("");
    setMembersNotice("");
    try {
      const data = await inviteProject({
        token,
        projectId,
        emails,
        access: invite.access,
        notify: invite.notify,
        message: invite.message
      });
      setInviteOpen(false);
      setInvite((s) => ({ ...s, emails: "", message: "" }));
      setMembersNotice(`Invited ${data?.invited || 0} user(s).`);
      await refreshMembers();
    } catch (e) {
      setMembersError(e?.message || "Invite failed");
    } finally {
      setMembersLoading(false);
    }
  };

  const onOpenRemove = (member) => {
    setRemoveEntry(member || null);
    setRemoveOpen(true);
    setMembersError("");
    setMembersNotice("");
  };

  const onRemove = async () => {
    const uid = normalize(removeEntry?.userId);
    if (!token || !projectId || !uid) return;
    setMembersLoading(true);
    setMembersError("");
    setMembersNotice("");
    try {
      await removeProjectMember({ token, projectId, userId: uid });
      setRemoveOpen(false);
      setRemoveEntry(null);
      setMembersNotice("Member removed.");
      await refreshMembers();
    } catch (e) {
      setMembersError(e?.message || "Remove failed");
    } finally {
      setMembersLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Dashboard</h2>
          <p className="muted">
            Signed in as {userLabel}
            {!hasProject
              ? " - Select a project to see requests."
              : projectTitle
                ? ` - Current project: ${projectTitle}`
                : ""}
          </p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={onRefresh} disabled={busy}>
            Refresh
          </button>
          {hasProject && projectUrl ? (
            <a className="btn subtle" href={projectUrl} target="_blank" rel="noreferrer">
              Open in DocSpace
            </a>
          ) : null}
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <div className="dashboard-grid">
        <div className="dashboard-main">
          {!hasProject ? (
            <StepsCard
              title="Getting started"
              subtitle="A quick walkthrough for new users."
              steps={[
                {
                  title: "Pick a project",
                  description: "Choose an existing project or create a new one. The current project is used for requests and templates.",
                  actionLabel: "Open Projects",
                  actionTone: "primary",
                  onAction: onOpenProjects
                },
                {
                  title: "Create a PDF form template",
                  description: "Templates are stored in your DocSpace My documents. Create or upload a PDF form, then publish it to a project.",
                  actionLabel: "Open Templates",
                  onAction: onOpenDrafts,
                  disabled: !token,
                  hint: "PDF only"
                },
                {
                  title: "Create your first request",
                  description: "After a template is published to the current project, click “New request” and pick a template.",
                  hint: "Project required"
                }
              ]}
            />
          ) : null}

          <section className="stats-grid">
            <StatCard title="In progress" value={stats.inProgress} meta="Requests you started" />
            <StatCard title="Completed" value={stats.completed} meta="Not tracked automatically yet" />
            <StatCard title="Other" value={stats.other} meta="Pending / declined" />
            <StatCard title="Total" value={stats.total} meta="All requests" />
          </section>

          <section className="card">
            <div className="card-header compact">
              <div>
                <h3>Requests</h3>
                <p className="muted">A request is a share link to a form template.</p>
              </div>
              <div className="card-header-actions">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by title..."
                  disabled={busy}
                  style={{ maxWidth: 260 }}
                />
                <span className="muted">Shown: {filtered.length}</span>
                {typeof onOpenDrafts === "function" ? (
                  <button type="button" onClick={onOpenDrafts} disabled={busy}>
                    Templates
                  </button>
                ) : null}
                {hasProject ? (
                  <button
                    type="button"
                    onClick={() => setInviteOpen(true)}
                    disabled={busy || !canManageProject}
                    title={!canManageProject ? "Only the project admin can invite people" : ""}
                  >
                    Invite people
                  </button>
                ) : null}
                <button type="button" className="primary" onClick={onPrimaryAction} disabled={busy}>
                  {hasProject ? "New request" : "Choose project"}
                </button>
              </div>
            </div>

            <div className="list">
              {!hasProject ? (
                <div className="empty">
                  <strong>No project selected</strong>
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    Pick a project in the sidebar to see its requests.
                  </p>
                  <div className="row-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
                    <button type="button" className="primary" onClick={onOpenProjects} disabled={busy}>
                      Open Projects
                    </button>
                  </div>
                </div>
              ) : !filtered.length ? (
                <div className="empty">
                  <strong>No requests yet</strong>
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    Click “New request”, select a template, and start filling.
                  </p>
                  {unassignedCount ? (
                    <p className="muted" style={{ margin: "6px 0 0" }}>
                      Note: {unassignedCount} request(s) are not linked to a project (created before project tracking).
                    </p>
                  ) : null}
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
                        Created: {(flow.createdAt || "").slice(0, 19).replace("T", " ")}
                      </span>
                    </div>
                    <div className="list-actions">
                      <button type="button" onClick={() => openFlow(flow)} disabled={!flow.openUrl}>
                        Open request
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
        </div>

        <div className="dashboard-side">
          {hasProject ? (
            <section className="card compact">
              <div className="card-header compact">
                <div>
                  <h3>People</h3>
                  <p className="muted">Members and roles (from the DocSpace room).</p>
                </div>
                <div className="card-header-actions">
                  <button type="button" onClick={() => refreshMembers()} disabled={busy || membersLoading}>
                    Refresh
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setInviteOpen(true)}
                    disabled={busy || membersLoading || !canManageProject}
                    title={!canManageProject ? "Only the project admin can invite people" : ""}
                  >
                    Invite
                  </button>
                </div>
              </div>

              {membersError ? <p className="error">{membersError}</p> : null}
              {membersNotice ? <p className="notice">{membersNotice}</p> : null}

              <div className="list">
                {!normalizedMembers.length ? (
                  <div className="empty">
                    <strong>No members data</strong>
                    <p className="muted" style={{ margin: "6px 0 0" }}>
                      Open the room in DocSpace to manage access.
                    </p>
                  </div>
                ) : (
                  normalizedMembers.map((m) => (
                    <div key={m.key} className="list-row">
                      <div className="list-main" style={{ minWidth: 0 }}>
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
                            disabled={busy || membersLoading || !canManageProject || !m.canRevoke || m.userId === meId}
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
          ) : null}
        </div>
      </div>

      <Modal
        open={sendOpen}
        title={projectTitle ? `New request - ${projectTitle}` : "New request"}
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

      <Modal
        open={inviteOpen}
        title={projectTitle ? `Invite to ${projectTitle}` : "Invite"}
        onClose={() => {
          if (membersLoading) return;
          setInviteOpen(false);
        }}
        footer={
          <>
            <button type="button" onClick={() => setInviteOpen(false)} disabled={busy || membersLoading}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={onInvite}
              disabled={busy || membersLoading || !normalize(invite.emails) || !canManageProject}
            >
              {membersLoading ? "Working..." : "Send invites"}
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
          <label className="inline-check">
            <input
              type="checkbox"
              checked={Boolean(invite.notify)}
              onChange={(e) => setInvite((s) => ({ ...s, notify: e.target.checked }))}
            />
            <span>Send notifications</span>
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
          if (membersLoading) return;
          setRemoveOpen(false);
        }}
        footer={
          <>
            <button type="button" onClick={() => setRemoveOpen(false)} disabled={busy || membersLoading}>
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              onClick={onRemove}
              disabled={busy || membersLoading || !removeEntry?.userId || !canManageProject}
            >
              {membersLoading ? "Working..." : "Remove"}
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

      <DocSpaceModal
        open={open}
        onClose={() => {
          setOpen(false);
          setModalUrl("");
        }}
        title={modalTitle}
        url={modalUrl}
      />
    </div>
  );
}
