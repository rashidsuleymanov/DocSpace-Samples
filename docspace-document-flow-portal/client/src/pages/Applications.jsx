import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import Topbar from "../components/Topbar.jsx";
import UploadModal from "../components/UploadModal.jsx";
import {
  createApplication,
  getApplicationTypes,
  getApplication,
  getRoomSummary,
  listApplications,
  submitApplication,
  uploadCopyApplicationFile,
  uploadLocalApplicationFile
} from "../services/docspaceApi.js";

export default function Applications({ session, onLogout, onNavigate }) {
  const [types, setTypes] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applications, setApplications] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [sourceFolderId, setSourceFolderId] = useState("");
  const [uploadModal, setUploadModal] = useState({
    open: false,
    requiredKey: "",
    targetFolderId: "",
    sourceFolderId: ""
  });
  const [activeDetails, setActiveDetails] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedTypes, loadedApps, summary] = await Promise.all([
          getApplicationTypes(),
          listApplications({ roomId: session?.room?.id }),
          session?.room?.id
            ? getRoomSummary({ roomId: session.room.id, token: session?.user?.token })
            : Promise.resolve([])
        ]);
        setTypes(loadedTypes);
        setApplications(loadedApps);
        const docsFolder = (summary || []).find(
          (item) => String(item.title || "").toLowerCase() === "my documents"
        );
        setSourceFolderId(docsFolder?.id || "");
        if (loadedApps?.[0]?.id) {
          setActiveId(loadedApps[0].id);
        }
      } catch (loadError) {
        setError(loadError?.message || "Failed to load applications");
      }
    };
    load();
  }, [session?.room?.id]);

  const activeType = useMemo(
    () => types.find((type) => type.key === selectedKey) || null,
    [types, selectedKey]
  );

  const activeApplication = useMemo(
    () => applications.find((item) => item.id === activeId) || null,
    [applications, activeId]
  );

  const requiredDocs = useMemo(
    () => activeDetails?.requiredDocuments || activeApplication?.requiredDocuments || [],
    [activeDetails, activeApplication]
  );

  const uploadsCount = useMemo(() => {
    const uploads = activeDetails?.uploads || {};
    return requiredDocs.filter((doc) => (uploads[doc] || []).length > 0).length;
  }, [activeDetails, requiredDocs]);

  const canSubmit = requiredDocs.length > 0 && uploadsCount === requiredDocs.length;

  const uploadedSet = useMemo(() => {
    const uploads = activeDetails?.uploads || {};
    return new Set(requiredDocs.filter((doc) => (uploads[doc] || []).length > 0));
  }, [activeDetails, requiredDocs]);

  useEffect(() => {
    if (!activeId) return;
    const loadDetails = async () => {
      try {
        const data = await getApplication(activeId);
        setActiveDetails(data?.application || null);
      } catch (loadError) {
        setError(loadError?.message || "Failed to load application details");
      }
    };
    loadDetails();
  }, [activeId]);

  const handleSelectType = (event) => {
    const key = event.target.value;
    setSelectedKey(key);
    const nextType = types.find((item) => item.key === key);
    const nextFields = {};
    (nextType?.fields || []).forEach((field) => {
      nextFields[field.key] = "";
    });
    setFields(nextFields);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedKey) return;
    setBusy(true);
    setError("");
    try {
      const created = await createApplication({
        roomId: session?.room?.id,
        user: session?.user,
        typeKey: selectedKey,
        fields
      });
      setApplications((items) => [created, ...items]);
      setActiveId(created.id);
      setActiveDetails(created);
      setSelectedKey("");
      setFields({});
    } catch (submitError) {
      setError(submitError?.message || "Failed to submit application");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar user={session.user} onLogout={onLogout} active="applications" onNavigate={onNavigate} />
      <main>
        <Topbar room={session.room} />
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Create an application</h3>
              <p className="muted">
                Pick a request type and fill in the required data. DocSpace will create the
                folder and templates automatically.
              </p>
            </div>
          </div>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              Application type
              <select value={selectedKey} onChange={handleSelectType}>
                <option value="">Select...</option>
                {types.map((type) => (
                  <option key={type.key} value={type.key}>
                    {type.title}
                  </option>
                ))}
              </select>
            </label>
            {activeType?.fields?.map((field) => (
              <label key={field.key}>
                {field.label}
                <input
                  type={field.type === "date" ? "date" : "text"}
                  value={fields[field.key] || ""}
                  required={field.required}
                  onChange={(event) =>
                    setFields((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              </label>
            ))}
            <button className="primary" type="submit" disabled={busy || !selectedKey}>
              {busy ? "Submitting..." : "Submit application"}
            </button>
            {error && <p className="muted">Error: {error}</p>}
          </form>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Active applications</h3>
              <p className="muted">Switch between applications to see uploads and templates.</p>
            </div>
          </div>
          {applications.length === 0 && <p className="muted">No applications yet.</p>}
          <div className="application-grid">
            {applications.map((item) => (
              <button
                key={item.id}
                className={`application-card ${activeId === item.id ? "active" : ""}`}
                onClick={() => setActiveId(item.id)}
              >
                <div className="application-card-head">
                  <strong>{item.type?.title || "Application"}</strong>
                  <span className={`status-chip ${item.status === "Submitted" ? "success" : ""}`}>
                    {item.status}
                  </span>
                </div>
                <span className="muted small">{formatDate(item.createdAt)}</span>
              </button>
            ))}
          </div>
        </section>

        {activeApplication && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>{activeApplication.type?.title}</h3>
                <p className="muted">
                  Folder: {activeApplication.folder?.title || "Applications"} • Status:{" "}
                  {activeApplication.status}
                </p>
              </div>
            </div>
            <div className="split-grid">
              <div>
                <h4>Generated templates</h4>
                <ul className="content-list">
                  {(activeApplication.documents || []).map((doc) => (
                    <li
                      key={doc.id || doc.title}
                      className="content-item file"
                      onClick={() => {
                        if (doc.url) {
                          window.open(doc.url, "_blank", "noopener,noreferrer");
                        }
                      }}
                    >
                      <span className="content-icon" />
                      <span className="content-title">{doc.title}</span>
                      <span className="muted small">Open</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Required uploads</h4>
                <ul className="checklist">
                  {requiredDocs.map((doc) => {
                    const isUploaded = uploadedSet.has(doc);
                    return (
                    <li key={doc} className="upload-row">
                      <span>{doc}</span>
                      <button
                        className={`secondary ${isUploaded ? "uploaded" : ""}`}
                        type="button"
                        disabled={isUploaded}
                        onClick={() =>
                          setUploadModal({
                            open: true,
                            requiredKey: doc,
                            targetFolderId: activeApplication.folder?.id || "",
                            sourceFolderId
                          })
                        }
                      >
                        {isUploaded ? "Uploaded" : "Upload"}
                      </button>
                    </li>
                    );
                  })}
                </ul>
                {activeDetails?.uploads && (
                  <p className="muted small">
                    Uploaded:{" "}
                    {uploadsCount} / {requiredDocs.length}
                  </p>
                )}
                <p className="muted small">
                  Officer receives the application only after all uploads are attached.
                </p>
                <button
                  className="primary"
                  type="button"
                  disabled={!canSubmit || activeApplication.status === "Submitted"}
                  onClick={async () => {
                    try {
                      const updated = await submitApplication(activeApplication.id);
                      setActiveDetails(updated);
                      setApplications((items) =>
                        items.map((item) => (item.id === updated.id ? updated : item))
                      );
                    } catch (submitError) {
                      setError(submitError?.message || "Failed to submit application");
                    }
                  }}
                >
                  {activeApplication.status === "Submitted" ? "Submitted" : "Send to officer"}
                </button>
                {activeApplication.issuedDocument && (
                  <>
                    <h4>Issued document</h4>
                    <ul className="content-list">
                      <li
                        className="content-item file"
                        onClick={() => {
                          if (activeApplication.issuedDocument.url) {
                            window.open(
                              activeApplication.issuedDocument.url,
                              "_blank",
                              "noopener,noreferrer"
                            );
                          }
                        }}
                      >
                        <span className="content-icon" />
                        <span className="content-title">
                          {activeApplication.issuedDocument.title || "Decision"}
                        </span>
                        <span className="muted small">Open</span>
                      </li>
                    </ul>
                  </>
                )}
              </div>
            </div>
          </section>
        )}
        <UploadModal
          open={uploadModal.open}
          title={uploadModal.requiredKey ? `Upload: ${uploadModal.requiredKey}` : "Upload document"}
          targetFolderId={uploadModal.targetFolderId}
          sourceFolderId={uploadModal.sourceFolderId}
          token={session?.user?.token}
          onClose={() =>
            setUploadModal({ open: false, requiredKey: "", targetFolderId: "", sourceFolderId: "" })
          }
          onUploadLocal={async (file) => {
            const result = await uploadLocalApplicationFile({
              applicationId: activeApplication.id,
              folderId: uploadModal.targetFolderId,
              fileName: file.name,
              requiredKey: uploadModal.requiredKey
            });
            if (result?.application) {
              setActiveDetails(result.application);
              setApplications((items) =>
                items.map((item) => (item.id === result.application.id ? result.application : item))
              );
            }
          }}
          onUploadCopy={async (fileId) => {
            const result = await uploadCopyApplicationFile({
              applicationId: activeApplication.id,
              fileId,
              destFolderId: uploadModal.targetFolderId,
              requiredKey: uploadModal.requiredKey
            });
            if (result?.application) {
              setActiveDetails(result.application);
              setApplications((items) =>
                items.map((item) => (item.id === result.application.id ? result.application : item))
              );
            }
          }}
        />
      </main>
    </div>
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
