import { useEffect, useMemo, useState } from "react";
import UploadModal from "../components/UploadModal.jsx";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import {
  createApplication,
  getApplication,
  getApplicationTypes,
  listApplications,
  submitApplication,
  uploadCopyApplicationFile,
  uploadLocalApplicationFile
} from "../services/docspaceApi.js";

export default function Applications({ session, actor, credentialsUrl, onNavigate }) {
  const [templates, setTemplates] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [activeDetails, setActiveDetails] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadModal, setUploadModal] = useState({
    open: false,
    requiredKey: "",
    targetFolderId: "",
    sourceFolderId: ""
  });
  const [docModal, setDocModal] = useState({
    open: false,
    title: "",
    url: "",
    fileId: ""
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [types, items] = await Promise.all([
          getApplicationTypes(),
          listApplications({ roomId: session?.room?.id })
        ]);
        setTemplates(types);
        setProjects(items);
        if (!selectedTemplate && types?.[0]?.key) {
          setSelectedTemplate(types[0].key);
        }
        if (!activeId && items?.[0]?.id) {
          setActiveId(items[0].id);
        }
      } catch (loadError) {
        setError(loadError?.message || "Failed to load projects");
      }
    };
    load();
  }, [session?.room?.id]);

  useEffect(() => {
    if (!activeId) {
      setActiveDetails(null);
      return;
    }
    const loadDetails = async () => {
      try {
        const details = await getApplication(activeId);
        setActiveDetails(details.application || null);
        setError("");
      } catch (loadError) {
        setError(loadError?.message || "Failed to load project details");
      }
    };
    loadDetails();
  }, [activeId]);

  const activeTemplate = useMemo(
    () => templates.find((item) => item.key === selectedTemplate) || null,
    [templates, selectedTemplate]
  );

  const createProject = async () => {
    if (!session?.room?.id || !selectedTemplate) return;
    setBusy(true);
    setError("");
    try {
      const project = await createApplication({
        roomId: session.room.id,
        user: actor.user,
        typeKey: selectedTemplate,
        fields
      });
      setProjects((items) => [project, ...items]);
      setActiveId(project.id);
      setFields({});
    } catch (createError) {
      setError(createError?.message || "Failed to create project");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitProject = async () => {
    if (!activeDetails?.id) return;
    setBusy(true);
    setError("");
    try {
      const project = await submitApplication(activeDetails.id);
      setActiveDetails(project);
      setProjects((items) => items.map((item) => (item.id === project.id ? project : item)));
    } catch (submitError) {
      setError(submitError?.message || "Failed to submit project");
    } finally {
      setBusy(false);
    }
  };

  const refreshActive = async () => {
    if (!activeId) return;
    const details = await getApplication(activeId);
    setActiveDetails(details.application || null);
    setProjects((items) =>
      items.map((item) => (item.id === details.application?.id ? details.application : item))
    );
  };

  const openDocument = (doc) => {
    setDocModal({
      open: true,
      title: doc?.title || "Document",
      url: doc?.url || "",
      fileId: doc?.id || ""
    });
  };

  return (
    <>
      <section className="hero-panel hero-panel--compact">
        <div className="hero-panel__copy">
          <span className="eyebrow">Structured collaboration</span>
          <h1>Project packages</h1>
          <p className="muted">
            Each package creates its own folder in the client room, seeds the starter documents,
            and lets the client hand over a complete package to the manager hub.
          </p>
        </div>
        <div className="hero-actions">
          <button className="secondary" type="button" onClick={() => onNavigate?.("overview")}>
            Back to overview
          </button>
        </div>
      </section>

      <section className="content-panel">
        <div className="panel-head">
          <div>
            <h3>Create new package</h3>
            <p className="muted">Choose a repeatable commercial workflow and tailor the kickoff fields.</p>
          </div>
        </div>

        {error ? <p className="muted">Error: {error}</p> : null}

        <div className="split-grid">
          <div className="composer-card">
            <label>
              Package template
              <select value={selectedTemplate} onChange={(event) => setSelectedTemplate(event.target.value)}>
                {templates.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>

            {activeTemplate ? (
              <>
                <p className="muted">{activeTemplate.description}</p>
                <div className="form-grid">
                  {(activeTemplate.fields || []).map((field) => (
                    <label key={field.key}>
                      {field.label}
                      <input
                        type={field.type === "date" ? "date" : "text"}
                        value={fields[field.key] || ""}
                        onChange={(event) =>
                          setFields((prev) => ({ ...prev, [field.key]: event.target.value }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </>
            ) : null}

            <button className="primary" type="button" onClick={createProject} disabled={busy || !selectedTemplate}>
              {busy ? "Creating..." : "Create project package"}
            </button>
          </div>

          <div className="detail-stack">
            <article className="insight-card">
              <h4>Required client files</h4>
              <div className="checklist">
                {(activeTemplate?.requiredDocuments || []).map((item) => (
                  <div key={item} className="upload-row compact">
                    <span>{item}</span>
                    <span className="muted small">Requested after package creation</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="insight-card">
              <h4>Starter documents</h4>
              <div className="checklist">
                {(activeTemplate?.formDocuments || []).map((item) => (
                  <div key={item} className="upload-row compact">
                    <span>{item}</span>
                    <span className="muted small">Generated automatically</span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="content-panel">
        <div className="panel-head">
          <div>
            <h3>Package queue</h3>
            <p className="muted">Clients can complete uploads, then hand the package off to the manager hub.</p>
          </div>
        </div>

        {projects.length === 0 ? <p className="muted">No packages yet.</p> : null}

        <div className="split-grid">
          <div className="project-list">
            {projects.map((item) => (
              <button
                key={item.id}
                className={`application-card ${activeId === item.id ? "active" : ""}`}
                type="button"
                onClick={() => setActiveId(item.id)}
              >
                <div className="application-card-head">
                  <strong>{item.type?.title || "Project"}</strong>
                  <span className={`status-chip ${item.status === "Completed" ? "success" : ""}`}>
                    {item.status}
                  </span>
                </div>
                <span className="muted small">{formatDate(item.createdAt)}</span>
              </button>
            ))}
          </div>

          <div className="project-detail">
            {!activeDetails ? <p className="muted">Select a package to view its details.</p> : null}
            {activeDetails ? (
              <>
                <div className="panel-head">
                  <div>
                    <h3>{activeDetails.type?.title}</h3>
                    <p className="muted">
                      Folder: {activeDetails.folder?.title || "Package folder"} • Status: {activeDetails.status}
                    </p>
                  </div>
                </div>

                <ul className="data-list">
                  {Object.entries(activeDetails.fields || {}).map(([key, value]) => (
                    <li key={key}>
                      <span className="muted">{labelize(key)}</span>
                      <strong>{value || "—"}</strong>
                    </li>
                  ))}
                </ul>

                <h4>Starter documents</h4>
                <ul className="content-list">
                  {(activeDetails.documents || []).map((doc) => (
                    <li key={doc.id || doc.title} className="content-item file" onClick={() => openDocument(doc)}>
                      <span className="content-icon" />
                      <span className="content-title">{doc.title}</span>
                      <span className="muted small">Open</span>
                    </li>
                  ))}
                </ul>

                <h4>Client file checklist</h4>
                <div className="checklist">
                  {(activeDetails.requiredDocuments || []).map((doc) => {
                    const uploads = activeDetails.uploads?.[doc] || [];
                    const uploaded = uploads.length > 0;
                    return (
                      <div key={doc} className="upload-row">
                        <span>{doc}</span>
                        <button
                          className={`secondary ${uploaded ? "uploaded" : ""}`}
                          type="button"
                          disabled={uploaded}
                          onClick={() =>
                            setUploadModal({
                              open: true,
                              requiredKey: doc,
                              targetFolderId: activeDetails.folder?.id || "",
                              sourceFolderId: ""
                            })
                          }
                        >
                          {uploaded ? "Uploaded" : "Upload"}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {activeDetails.status !== "Submitted" && activeDetails.status !== "Completed" ? (
                  <button className="primary" type="button" onClick={handleSubmitProject} disabled={busy}>
                    {busy ? "Submitting..." : "Send to manager"}
                  </button>
                ) : (
                  <p className="muted">
                    {activeDetails.status === "Completed"
                      ? "This package has already been completed by the manager."
                      : "This package is already waiting in the manager hub."}
                  </p>
                )}
              </>
            ) : null}
          </div>
        </div>
      </section>

      <UploadModal
        open={uploadModal.open}
        title={uploadModal.requiredKey ? `Upload: ${uploadModal.requiredKey}` : "Upload"}
        targetFolderId={uploadModal.targetFolderId}
        sourceFolderId={uploadModal.sourceFolderId}
        token={actor?.user?.token}
        onClose={() =>
          setUploadModal({
            open: false,
            requiredKey: "",
            targetFolderId: "",
            sourceFolderId: ""
          })
        }
        onUploadLocal={async (file) => {
          await uploadLocalApplicationFile({
            applicationId: activeDetails.id,
            folderId: uploadModal.targetFolderId,
            fileName: file.name,
            requiredKey: uploadModal.requiredKey
          });
          await refreshActive();
        }}
        onUploadCopy={async (fileId) => {
          await uploadCopyApplicationFile({
            applicationId: activeDetails.id,
            fileId,
            destFolderId: uploadModal.targetFolderId,
            requiredKey: uploadModal.requiredKey
          });
          await refreshActive();
        }}
      />

      <DocSpaceModal
        open={docModal.open}
        title={docModal.title}
        url={docModal.url}
        fileId={docModal.fileId}
        token={actor?.user?.token}
        credentialsUrl={credentialsUrl}
        onClose={() => setDocModal({ open: false, title: "", url: "", fileId: "" })}
      />
    </>
  );
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function labelize(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
