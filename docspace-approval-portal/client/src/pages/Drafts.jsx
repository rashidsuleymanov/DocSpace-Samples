import { useEffect, useMemo, useState } from "react";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import Modal from "../components/Modal.jsx";
import StatusPill from "../components/StatusPill.jsx";
import StepsCard from "../components/StepsCard.jsx";
import {
  createDraft,
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
  const [projects, setProjects] = useState([]);
  const [projectPermissions, setProjectPermissions] = useState({});
  const [selectedProjectId, setSelectedProjectId] = useState("");

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

  useEffect(() => {
    refresh().catch(() => null);
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
    } catch (e) {
      setError(e?.message || "Create failed");
    } finally {
      setLoading(false);
    }
  };

  const openPublish = async (file) => {
    setPublishFile(file || null);
    setSelectedProjectId("");
    setPublishOpen(true);
    setError("");
    setNotice("");
    try {
      await loadProjects();
    } catch (e) {
      setError(e?.message || "Failed to load projects");
    }
  };

  const onPublish = async () => {
    const fileId = normalize(publishFile?.id);
    const projectId = normalize(selectedProjectId);
    if (!fileId || !projectId) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const project = (projects || []).find((p) => String(p.id) === projectId) || null;
      if (!project?.roomId) throw new Error("Project room is missing");

      if (!projectPermissions?.[String(projectId)]) {
        throw new Error("Only the project admin can publish templates to this project.");
      }

      const result = token ? await publishDraft({ token, fileId, projectId, activate: true }) : null;
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

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Templates</h2>
          <p className="muted">Stored in your DocSpace My documents. Publish a template to make it available in a project.</p>
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

      {!loading && !error && filtered.length === 0 ? (
        <StepsCard
          title="How templates work"
          subtitle="Templates are PDF forms stored in your DocSpace My documents."
          steps={[
            {
              title: "Create a PDF template",
              description: "Click “New file” to create a PDF, or upload an existing PDF form in DocSpace My documents.",
              hint: "PDF only",
            },
            {
              title: "Publish to a project",
              description: "Use “Publish to project…” on a template to copy it into the project room.",
              hint: "Admin only",
            },
            {
              title: "Create requests on Dashboard",
              description: "Go to Dashboard → “New request” and select a published template.",
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
                    Publish to project...
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
                !normalize(selectedProjectId) ||
                !projectPermissions?.[String(selectedProjectId)]
              }
            >
              {loading ? "Working..." : "Send to project"}
            </button>
          </>
        }
      >
        <form className="auth-form" onSubmit={(e) => e.preventDefault()} style={{ marginTop: 0 }}>
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
