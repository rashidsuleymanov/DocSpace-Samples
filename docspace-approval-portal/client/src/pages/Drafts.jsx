import { useEffect, useMemo, useState } from "react";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import Modal from "../components/Modal.jsx";
import StatusPill from "../components/StatusPill.jsx";
import StepsCard from "../components/StepsCard.jsx";
import {
  createDraft,
  getProjectTemplatesRoom,
  listSharedTemplates,
  createFlowFromTemplate,
  getProjectsPermissions,
  getProjectsSidebar,
  listDrafts,
  publishDraft,
} from "../services/portalApi.js";

function normalize(value) {
  return String(value || "").trim();
}

function ensurePdfTitle(value) {
  const title = normalize(value);
  if (!title) return "Template.pdf";
  const lower = title.toLowerCase();
  if (lower.endsWith(".pdf")) return title;
  const dot = title.lastIndexOf(".");
  if (dot > 0) return `${title.slice(0, dot)}.pdf`;
  return `${title}.pdf`;
}

export default function Drafts({ session, busy, onOpenProject, onOpenProjects }) {
  const token = session?.token || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [drafts, setDrafts] = useState([]);
  const [query, setQuery] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("Template.pdf");

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishFile, setPublishFile] = useState(null);
  const [publishDestination, setPublishDestination] = useState("project");
  const [projects, setProjects] = useState([]);
  const [projectPermissions, setProjectPermissions] = useState({});
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [templatesRoom, setTemplatesRoom] = useState(null);
  const [templatesRoomLoading, setTemplatesRoomLoading] = useState(false);
  const [sharedTemplates, setSharedTemplates] = useState([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestTemplate, setRequestTemplate] = useState(null);
  const [requestProjects, setRequestProjects] = useState([]);
  const [requestActiveRoomId, setRequestActiveRoomId] = useState("");
  const [requestProjectId, setRequestProjectId] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);

  const [docModal, setDocModal] = useState({ open: false, title: "", url: "" });

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await listDrafts({ token });
      setDrafts(Array.isArray(data?.drafts) ? data.drafts : []);
    } catch (e) {
      const msg = String(e?.message || "Failed to load templates");
      setError(msg);
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    if (!token) return;
    const [sidebar, perms] = await Promise.all([
      getProjectsSidebar({ token }).catch(() => null),
      getProjectsPermissions({ token }).catch(() => null)
    ]);
    setProjects(Array.isArray(sidebar?.projects) ? sidebar.projects : []);
    setProjectPermissions(perms?.permissions && typeof perms.permissions === "object" ? perms.permissions : {});
  };

  const refreshTemplatesRoom = async () => {
    if (!token) return null;
    setTemplatesRoomLoading(true);
    try {
      const data = await getProjectTemplatesRoom({ token });
      const room = data?.room ? { ...data.room, hasAccess: Boolean(data?.hasAccess) } : null;
      setTemplatesRoom(room);
      return room;
    } catch {
      setTemplatesRoom(null);
      return null;
    } finally {
      setTemplatesRoomLoading(false);
    }
  };

  const refreshSharedTemplates = async () => {
    if (!token) return;
    setSharedLoading(true);
    try {
      const data = await listSharedTemplates({ token });
      setSharedTemplates(Array.isArray(data?.templates) ? data.templates : []);
    } catch {
      setSharedTemplates([]);
    } finally {
      setSharedLoading(false);
    }
  };

  useEffect(() => {
    refresh().catch(() => null);
    refreshTemplatesRoom().catch(() => null);
    refreshSharedTemplates().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = useMemo(() => {
    const q = normalize(query).toLowerCase();
    const items = Array.isArray(drafts) ? drafts : [];
    const pdfOnly = items.filter((d) => {
      const ext = String(d?.fileExst || "").trim().toLowerCase();
      const title = String(d?.title || "").trim().toLowerCase();
      return ext === "pdf" || ext === ".pdf" || title.endsWith(".pdf");
    });
    if (!q) return pdfOnly;
    return pdfOnly.filter((d) => String(d.title || d.id || "").toLowerCase().includes(q));
  }, [drafts, query]);

  const onCreate = async () => {
    const title = ensurePdfTitle(createTitle);
    if (!title) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      if (!token) return;
      await createDraft({ token, title });
      setCreateOpen(false);
      setNotice("Template created.");
      await refresh();
      window.dispatchEvent(new CustomEvent("portal:draftsChanged"));
    } catch (e) {
      setError(e?.message || "Create failed");
    } finally {
      setLoading(false);
    }
  };

  const openPublish = async (file) => {
    setPublishFile(file || null);
    setSelectedProjectId("");
    setPublishDestination("project");
    setPublishOpen(true);
    setError("");
    setNotice("");
    try {
      await Promise.all([loadProjects(), refreshTemplatesRoom()]);
    } catch (e) {
      setError(e?.message || "Failed to load projects");
    }
  };

  const onPublish = async () => {
    const fileId = normalize(publishFile?.id);
    const projectId = normalize(selectedProjectId);
    const destination = normalize(publishDestination) || "project";
    if (!fileId) return;
    if (destination !== "templatesRoom" && !projectId) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      if (destination === "templatesRoom") {
        if (!templatesRoom?.id) {
          throw new Error("Shared templates room is not available. Open Settings and configure an admin token.");
        }
        const result = token
          ? await publishDraft({ token, fileId, destination: "templatesRoom", activate: false })
          : null;
        if (!result) throw new Error("Authorization token is required");
        setPublishOpen(false);
        setNotice(
          result?.warning
            ? `Published to "${templatesRoom?.title || "Projects Templates"}". ${result.warning}`
            : `Published to "${templatesRoom?.title || "Projects Templates"}".`
        );
        return;
      }

      const project = (projects || []).find((p) => String(p.id) === projectId) || null;
      if (!project?.roomId) throw new Error("Project room is missing");

      if (!projectPermissions?.[String(projectId)]) {
        throw new Error("Only the project admin can publish templates to this project.");
      }

      const result = token ? await publishDraft({ token, fileId, projectId, destination: "project", activate: true }) : null;
      if (!result) throw new Error("Authorization token is required");
      setPublishOpen(false);
      window.dispatchEvent(new CustomEvent("portal:projectChanged"));
      setNotice(
        result?.warning
          ? `Published to project and set as current. ${result.warning}`
          : "Published to project and set as current."
      );
    } catch (e) {
      setError(e?.message || "Publish failed");
    } finally {
      setLoading(false);
    }
  };

  const openDoc = (draft) => {
    const url = String(draft?.webUrl || "").trim();
    if (!url) return;
    setDocModal({ open: true, title: draft?.title || "Template", url });
  };

  const startRequestFromSharedTemplate = async (template) => {
    if (!template?.id) return;
    setRequestTemplate(template);
    setRequestOpen(true);
    setRequestBusy(true);
    setError("");
    setNotice("");
    try {
      if (!token) throw new Error("Authorization token is required");
      const sidebar = await getProjectsSidebar({ token }).catch(() => null);
      const list = Array.isArray(sidebar?.projects) ? sidebar.projects : [];
      const activeRoomId = String(sidebar?.activeRoomId || "").trim();
      setRequestProjects(list);
      setRequestActiveRoomId(activeRoomId);
      const activeProject = activeRoomId ? list.find((p) => String(p?.roomId || "").trim() === activeRoomId) : null;
      const defaultProjectId = String(activeProject?.id || list?.[0]?.id || "").trim();
      setRequestProjectId(defaultProjectId);
    } catch (e) {
      setError(e?.message || "Failed to load projects");
    } finally {
      setRequestBusy(false);
    }
  };

  const onCreateRequest = async () => {
    const templateId = normalize(requestTemplate?.id);
    const projectId = normalize(requestProjectId);
    if (!templateId || !projectId) return;
    setRequestBusy(true);
    setError("");
    setNotice("");
    try {
      if (!token) throw new Error("Authorization token is required");
      const result = await createFlowFromTemplate({ token, templateFileId: templateId, projectId });
      const flow = result?.flow || null;
      setRequestOpen(false);
      setRequestTemplate(null);
      setNotice(flow ? `Request created: ${flow.fileTitle || flow.templateTitle || flow.id}` : "Request created.");
      window.dispatchEvent(new CustomEvent("portal:projectChanged"));
    } catch (e) {
      setError(e?.message || "Failed to create request");
    } finally {
      setRequestBusy(false);
    }
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Templates</h2>
          <p className="muted">Stored in your DocSpace My documents. Publish a template to a project or to the shared room.</p>
        </div>
        <div className="topbar-actions">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates..."
            disabled={busy || loading}
            style={{ maxWidth: 320 }}
          />
          <button type="button" onClick={onOpenProjects} disabled={busy || loading}>
            Projects
          </button>
          <button type="button" onClick={refresh} disabled={busy || loading}>
            Refresh
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => setCreateOpen(true)}
            disabled={busy || loading || !token}
          >
            New file
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}
      {templatesRoom?.id ? (
        <p className="muted" style={{ marginTop: -6 }}>
          Shared templates room: <strong>{templatesRoom?.title || "Projects Templates"}</strong>{" "}
          {templatesRoom?.roomUrl ? (
            <a className="btn link" href={templatesRoom.roomUrl} target="_blank" rel="noreferrer">
              Open in DocSpace
            </a>
          ) : null}
        </p>
      ) : templatesRoomLoading ? (
        <p className="muted" style={{ marginTop: -6 }}>Checking shared templates room...</p>
      ) : null}

      <section className="card">
        <div className="card-header compact">
          <div>
            <h3>Shared templates</h3>
            <p className="muted">PDF forms available to everyone in this portal.</p>
          </div>
          <div className="card-header-actions">
            <button type="button" onClick={refreshSharedTemplates} disabled={busy || loading || sharedLoading || !token}>
              Refresh
            </button>
            <span className="muted">Shown: {Array.isArray(sharedTemplates) ? sharedTemplates.length : 0}</span>
          </div>
        </div>

        <div className="list">
          {sharedLoading ? (
            <div className="empty">
              <strong>Loading...</strong>
            </div>
          ) : !templatesRoom?.id ? (
            <div className="empty">
              <strong>Shared room is not available</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Open Settings and configure an admin token so the portal can create/share the room.
              </p>
            </div>
          ) : sharedTemplates.length === 0 ? (
            <div className="empty">
              <strong>No shared templates yet</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Publish a PDF template to the shared room to make it available for everyone.
              </p>
            </div>
          ) : (
            sharedTemplates.slice(0, 8).map((t) => (
              <div key={t.id} className="list-row">
                <div className="list-main">
                  <strong className="truncate">{t.title || `File ${t.id}`}</strong>
                  <span className="muted truncate">
                    <StatusPill tone={t.isForm ? "green" : "gray"}>{t.isForm ? "Form" : t.fileExst || "File"}</StatusPill>{" "}
                    ID: {t.id}
                  </span>
                </div>
                <div className="list-actions">
                  {t.webUrl ? (
                    <a className="btn" href={t.webUrl} target="_blank" rel="noreferrer">
                      New tab
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="primary"
                    onClick={() => startRequestFromSharedTemplate(t)}
                    disabled={busy || loading || !token}
                    title="Choose a project for this request"
                  >
                    Create request
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {sharedTemplates.length > 8 ? (
          <p className="muted" style={{ marginTop: 10 }}>
            Showing 8 of {sharedTemplates.length}. Open the room in DocSpace to browse all templates.
          </p>
        ) : null}
      </section>

      {!loading && !error && filtered.length === 0 ? (
        <StepsCard
          title="How templates work"
          subtitle="Templates are PDF forms stored in your DocSpace My documents."
          steps={[
            {
              title: "Create a PDF template",
              description: 'Click "New file" to create a PDF, or upload an existing PDF form in DocSpace My documents.',
              hint: "PDF only",
            },
            {
              title: "Publish to a project",
              description: 'Use "Publish..." on a template to copy it into a project room or to the shared room.',
              hint: "Admin only",
            },
            {
              title: "Create requests on Dashboard",
              description: 'Pick a project, then go to Home → "New request" and select a published template.',
            },
          ]}
        />
      ) : null}

      <section className="card">
        <div className="card-header">
          <h3>My documents</h3>
          <p className="muted">Shown: {filtered.length}</p>
        </div>

        <div className="list">
          {!filtered.length ? (
            <div className="empty">
              <strong>No templates yet</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Create a new template or upload files in DocSpace My documents.
              </p>
            </div>
          ) : (
            filtered.map((d) => (
              <div key={d.id} className="list-row">
                <div className="list-main">
                  <strong className="truncate">{d.title || `File ${d.id}`}</strong>
                  <span className="muted truncate">
                    <StatusPill tone={d.isForm ? "green" : "gray"}>{d.isForm ? "Form" : d.fileExst || "File"}</StatusPill>{" "}
                    ID: {d.id}
                  </span>
                </div>
                <div className="list-actions">
                  <button type="button" onClick={() => openDoc(d)} disabled={!d.webUrl || busy || loading}>
                    Edit
                  </button>
                  {d.webUrl ? (
                    <a className="btn" href={d.webUrl} target="_blank" rel="noreferrer">
                      New tab
                    </a>
                  ) : null}
                  <button type="button" className="primary" onClick={() => openPublish(d)} disabled={busy || loading}>
                    Publish...
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <Modal
        open={createOpen}
        title="Create template"
        onClose={() => {
          if (loading) return;
          setCreateOpen(false);
        }}
        footer={
          <>
            <button type="button" onClick={() => setCreateOpen(false)} disabled={busy || loading}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={onCreate}
              disabled={
                busy ||
                loading ||
                !normalize(createTitle) ||
                !token
              }
            >
              {loading ? "Working..." : "Create"}
            </button>
          </>
        }
      >
        <form className="auth-form" onSubmit={(e) => e.preventDefault()} style={{ marginTop: 0 }}>
          <label>
            <span>File name</span>
            <input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} disabled={busy || loading} />
          </label>
          <p className="muted" style={{ margin: 0 }}>
            PDF only: <code>.pdf</code> is enforced.
          </p>
        </form>
      </Modal>

      <Modal
        open={publishOpen}
        title={publishFile?.title ? `Publish "${publishFile.title}"` : "Publish"}
        onClose={() => {
          if (loading) return;
          setPublishOpen(false);
        }}
        footer={
          <>
            <button type="button" onClick={() => setPublishOpen(false)} disabled={busy || loading}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={onPublish}
              disabled={
                busy ||
                loading ||
                !publishFile?.id ||
                (publishDestination !== "templatesRoom" &&
                  (!normalize(selectedProjectId) || !projectPermissions?.[String(selectedProjectId)])) ||
                (publishDestination === "templatesRoom" && !templatesRoom?.id)
              }
            >
              {loading
                ? "Working..."
                : publishDestination === "templatesRoom"
                  ? "Send to shared room"
                  : "Send to project"}
            </button>
          </>
        }
      >
        <form className="auth-form" onSubmit={(e) => e.preventDefault()} style={{ marginTop: 0 }}>
          <label>
            <span>Destination</span>
            <select value={publishDestination} onChange={(e) => setPublishDestination(e.target.value)} disabled={busy || loading}>
              <option value="project">Project room</option>
              <option value="templatesRoom">Shared room: {templatesRoom?.title || "Projects Templates"}</option>
            </select>
          </label>

          {publishDestination === "templatesRoom" ? (
            <div className="empty" style={{ marginTop: 0 }}>
              <strong>{templatesRoom?.id ? "Shared room selected" : "Shared room is not available"}</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                {templatesRoom?.id
                  ? "The PDF will be copied into the shared room Templates folder. Everyone registered in this portal gets access."
                  : "Open Settings and configure an admin token so the portal can create/share the room."}
              </p>
            </div>
          ) : (
            <>
              <label>
                <span>Project</span>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  disabled={busy || loading}
                >
                  <option value="">Select a project...</option>
                  {(projects || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}{!projectPermissions?.[String(p.id)] ? " (admin only)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {normalize(selectedProjectId) && !projectPermissions?.[String(selectedProjectId)] ? (
                <p className="muted" style={{ marginTop: 0 }}>
                  Only the project admin can publish templates to this project.
                </p>
              ) : null}
              <div className="row-actions" style={{ justifyContent: "space-between" }}>
                <button type="button" onClick={onOpenProjects} disabled={busy || loading}>
                  Open Projects
                </button>
                <span className="muted" style={{ fontSize: 13 }}>
                  Copies file to the project room.
                </span>
              </div>
            </>
          )}
        </form>
      </Modal>

      <Modal
        open={requestOpen}
        title={requestTemplate?.title ? `Create request — ${requestTemplate.title}` : "Create request"}
        onClose={() => {
          if (requestBusy) return;
          setRequestOpen(false);
          setRequestTemplate(null);
        }}
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setRequestOpen(false);
                setRequestTemplate(null);
              }}
              disabled={busy || requestBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={onCreateRequest}
              disabled={busy || requestBusy || !normalize(requestProjectId) || !requestTemplate?.id}
            >
              {requestBusy ? "Working..." : "Create request"}
            </button>
          </>
        }
      >
        <form className="auth-form" onSubmit={(e) => e.preventDefault()} style={{ marginTop: 0 }}>
          {!requestProjects.length ? (
            <div className="empty" style={{ marginTop: 0 }}>
              <strong>No projects</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Create a project first, then try again.
              </p>
              <div className="row-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
                <button type="button" className="primary" onClick={onOpenProjects} disabled={busy || requestBusy}>
                  Open Projects
                </button>
              </div>
            </div>
          ) : (
            <label>
              <span>Project</span>
              <select
                value={requestProjectId}
                onChange={(e) => setRequestProjectId(e.target.value)}
                disabled={busy || requestBusy}
              >
                <option value="">Select a project...</option>
                {(requestProjects || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {requestActiveRoomId && String(p.roomId) === String(requestActiveRoomId) ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="muted" style={{ marginTop: 0 }}>
            We will create a fill-out link for this template and track the request in the selected project.
          </p>
        </form>
      </Modal>

      <DocSpaceModal
        open={docModal.open}
        title={docModal.title}
        url={docModal.url}
        onClose={() => setDocModal({ open: false, title: "", url: "" })}
      />
    </div>
  );
}
