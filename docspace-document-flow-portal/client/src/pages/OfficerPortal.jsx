import { useEffect, useMemo, useRef, useState } from "react";
import {
  createOfficerRequest,
  getOfficerApplication,
  issueOfficerDocx,
  listOfficerApplications,
  listOfficerRequests,
  closeOfficerApplication
} from "../services/officerApi.js";

let sdkLoaderPromise = null;

export default function OfficerPortal({ officer, onExit }) {
  const [applications, setApplications] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [requests, setRequests] = useState([]);
  const [requestForm, setRequestForm] = useState({
    title: "Tax report request",
    periodFrom: "",
    periodTo: "",
    requiredDocuments: "Tax report"
  });
  const [requestMessage, setRequestMessage] = useState("");

  const activeRoomId = details?.application?.roomId || "";
  const docspaceUrl = import.meta.env.VITE_DOCSPACE_URL || "";
  const editorFrameId = "officer-decision-editor-hidden";
  const editorRef = useRef(null);

  const destroyEditor = () => {
    if (editorRef.current?.destroy) {
      editorRef.current.destroy();
    }
    editorRef.current = null;
  };

  const loadDocSpaceSdk = (src) => {
    if (window.DocSpace?.SDK) {
      return Promise.resolve(window.DocSpace.SDK);
    }
    if (sdkLoaderPromise) return sdkLoaderPromise;
    sdkLoaderPromise = new Promise((resolve, reject) => {
      if (!src) {
        reject(new Error("DocSpace URL is missing"));
        return;
      }
      const script = document.createElement("script");
      script.src = `${src}/static/scripts/sdk/2.0.0/api.js`;
      script.async = true;
      script.onload = () => resolve(window.DocSpace?.SDK);
      script.onerror = () => reject(new Error("Failed to load DocSpace SDK"));
      document.head.appendChild(script);
    });
    return sdkLoaderPromise;
  };

  const fillDecisionHidden = async (file, application) => {
    if (!file?.id) return;
    if (!docspaceUrl) {
      setError("VITE_DOCSPACE_URL is not set");
      return;
    }
    const token = file?.shareToken || officer?.token || "";
    if (!token) {
      setError("DocSpace token is missing");
      return;
    }
    destroyEditor();
    await loadDocSpaceSdk(docspaceUrl);
    const instance = window.DocSpace?.SDK?.initEditor({
      src: docspaceUrl,
      id: String(file.id),
      frameId: editorFrameId,
      requestToken: token,
      width: "1px",
      height: "1px",
      events: {
        onAppReady: () => {
          const frameInstance = window.DocSpace?.SDK?.frames?.[editorFrameId];
          if (!frameInstance) {
            setError("Editor frame is not available.");
            destroyEditor();
            return;
          }
          const decisionText = buildDecisionText(application);
          const editorCallback = new Function(
            "editorInstance",
            `
              try {
                if (typeof editorInstance?.createConnector !== "function") {
                  console.error("createConnector is not available", editorInstance);
                  return;
                }
                const connector = editorInstance.createConnector();
                if (typeof connector?.callCommand !== "function") {
                  console.error("connector.callCommand is not available", connector);
                  return;
                }
                Asc.scope.textToInsert = ${JSON.stringify(decisionText)};
                connector.callCommand(function () {
                  const doc = Api.GetDocument();
                  const p = Api.CreateParagraph();
                  p.AddText(Asc.scope.textToInsert);
                  doc.InsertContent([p]);
                  Api.Save();
                });
              } catch (e) {
                console.error("Error executing editor callback", e);
              }
            `
          );
          frameInstance.executeInEditor(editorCallback);
          setTimeout(() => {
            destroyEditor();
          }, 6000);
        },
        onAppError: (err) => {
          console.error("DocSpace editor error", err);
          setError(`DocSpace editor error: ${err?.message || err}`);
        }
      }
    });
    editorRef.current = instance;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const items = await listOfficerApplications();
        setApplications(items);
        if (items?.[0]?.id) {
          setActiveId(items[0].id);
        }
      } catch (loadError) {
        setError(loadError?.message || "Failed to load applications");
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const loadDetails = async () => {
      try {
        const data = await getOfficerApplication(activeId);
        setDetails(data);
        setError("");
      } catch (loadError) {
        setError(loadError?.message || "Failed to load application");
      }
    };
    loadDetails();
  }, [activeId]);

  useEffect(() => {
    if (!activeRoomId) {
      setRequests([]);
      return;
    }
    const loadRequests = async () => {
      try {
        const items = await listOfficerRequests(activeRoomId);
        setRequests(items);
      } catch {
        setRequests([]);
      }
    };
    loadRequests();
  }, [activeRoomId]);

  const issuedDocument = useMemo(() => details?.application?.issuedDocument || null, [details]);

  return (
    <div className="officer-layout">
      <aside className="officer-sidebar">
        <div className="sidebar-brand">
          <span className="brand-dot" />
          DocFlow Officer
        </div>
        <div className="sidebar-user">
          <div className="avatar">{initials(officer?.displayName)}</div>
          <div>
            <strong>{officer?.displayName || "Officer"}</strong>
            <span className="muted">{officer?.title || "Public Service"}</span>
          </div>
        </div>
        <div className="officer-list">
          <h4>Incoming applications</h4>
          {applications.map((item) => (
            <button
              key={item.id}
              className={`application-card ${activeId === item.id ? "active" : ""}`}
              onClick={() => setActiveId(item.id)}
            >
              <div>
                <strong>{item.type?.title || "Application"}</strong>
                <span className="muted">{item.status}</span>
              </div>
              <span className="muted small">{formatDate(item.createdAt)}</span>
            </button>
          ))}
        </div>
        <button className="ghost" onClick={onExit}>
          Exit officer view
        </button>
      </aside>
      <main>
        <header className="officer-header">
          <div>
            <h2>Applicant overview</h2>
            <p className="muted">Review submitted data and attached documents.</p>
          </div>
        </header>
        {error && <p className="muted">Error: {error}</p>}
        {!details?.application && <p className="muted">Select an application to review.</p>}
        {details?.application && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>{details.application.type?.title}</h3>
                <p className="muted">
                  Applicant: {details.application.user?.name || "Citizen"} •{" "}
                  {details.application.user?.email || "—"}
                </p>
              </div>
              {details.application.status !== "Closed" && (
                <button
                  className="primary"
                  onClick={async () => {
                    try {
                      setIssuing(true);
                      const result = await issueOfficerDocx(details.application.id);
                      const file = result?.file || null;
                      await fillDecisionHidden(file, details.application);
                      await new Promise((resolve) => setTimeout(resolve, 6500));
                      const closed = await closeOfficerApplication({
                        applicationId: details.application.id,
                        issuedDocument: file
                      });
                      setDetails({ application: closed });
                      setApplications((items) =>
                        items.filter((item) => item.id !== details.application.id)
                      );
                      setActiveId("");
                    } catch (issueError) {
                      setError(issueError?.message || "Failed to issue document");
                    } finally {
                      setIssuing(false);
                    }
                  }}
                  disabled={issuing}
                >
                  {issuing ? "Issuing..." : "Issue decision"}
                </button>
              )}
              {details.application.folder?.webUrl ? (
                <button
                  className="secondary"
                  onClick={() =>
                    window.open(
                      details.application.folder.webUrl,
                      "_blank",
                      "noopener,noreferrer"
                    )
                  }
                >
                  Open folder
                </button>
              ) : null}
            </div>
            <div className="split-grid">
              <div>
                <h4>Submitted data</h4>
                <ul className="data-list">
                  {Object.entries(details.application.fields || {}).map(([key, value]) => (
                    <li key={key}>
                      <span className="muted">{labelize(key)}</span>
                      <strong>{value || "—"}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Documents</h4>
                <ul className="content-list">
                  {(details.application.documents || []).map((doc) => (
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
                {details.application.uploads && (
                  <>
                    <h4>Uploaded files</h4>
                    <ul className="content-list">
                      {Object.entries(details.application.uploads).flatMap(([key, files]) =>
                        (files || []).map((file) => (
                          <li
                            key={`${key}-${file.id || file.title}`}
                            className="content-item file"
                            onClick={() => {
                              if (file.url) {
                                window.open(file.url, "_blank", "noopener,noreferrer");
                              }
                            }}
                          >
                            <span className="content-icon" />
                            <span className="content-title">{file.title || key}</span>
                            <span className="muted small">Open</span>
                          </li>
                        ))
                      )}
                    </ul>
                  </>
                )}
                {issuedDocument && (
                  <>
                    <h4>Issued document</h4>
                    <ul className="content-list">
                      <li
                        className="content-item file"
                        onClick={() => {
                          if (issuedDocument.url) {
                            window.open(issuedDocument.url, "_blank", "noopener,noreferrer");
                          }
                        }}
                      >
                        <span className="content-icon" />
                        <span className="content-title">{issuedDocument.title || "Decision"}</span>
                        <span className="muted small">Open</span>
                      </li>
                    </ul>
                  </>
                )}
              </div>
            </div>
          </section>
        )}
        {details?.application && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>Requests</h3>
                <p className="muted">Ask the citizen for missing information or reports.</p>
              </div>
            </div>
            <form
              className="form-grid"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!activeRoomId || !requestForm.title.trim()) return;
                try {
                  const requiredDocuments = requestForm.requiredDocuments
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean);
                  const created = await createOfficerRequest({
                    roomId: activeRoomId,
                    title: requestForm.title,
                    periodFrom: requestForm.periodFrom,
                    periodTo: requestForm.periodTo,
                    requiredDocuments
                  });
                  setRequests((items) => [created, ...items]);
                  setRequestMessage("Request sent to citizen.");
                } catch (requestError) {
                  setRequestMessage(requestError?.message || "Failed to create request");
                }
              }}
            >
              <label>
                Request title
                <input
                  type="text"
                  value={requestForm.title}
                  onChange={(event) =>
                    setRequestForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Period from
                <input
                  type="date"
                  value={requestForm.periodFrom}
                  onChange={(event) =>
                    setRequestForm((prev) => ({ ...prev, periodFrom: event.target.value }))
                  }
                />
              </label>
              <label>
                Period to
                <input
                  type="date"
                  value={requestForm.periodTo}
                  onChange={(event) =>
                    setRequestForm((prev) => ({ ...prev, periodTo: event.target.value }))
                  }
                />
              </label>
              <label>
                Required documents (comma separated)
                <input
                  type="text"
                  value={requestForm.requiredDocuments}
                  onChange={(event) =>
                    setRequestForm((prev) => ({ ...prev, requiredDocuments: event.target.value }))
                  }
                />
              </label>
              <button className="secondary" type="submit">
                Send request
              </button>
              {requestMessage && <p className="muted">{requestMessage}</p>}
            </form>
            <div className="application-grid">
              {requests.map((request) => (
                <div key={request.id} className="application-card">
                  <div className="application-card-head">
                    <strong>{request.title}</strong>
                    <span className={`status-chip ${request.status === "Completed" ? "success" : ""}`}>
                      {request.status}
                    </span>
                  </div>
                  <span className="muted small">
                    {request.periodFrom || "—"} → {request.periodTo || "—"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
        <div id={editorFrameId} className="hidden-editor" />
      </main>
    </div>
  );
}

function initials(value) {
  return String(value || "O")
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function labelize(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function buildDecisionText(application) {
  const lines = [];
  lines.push("DECISION SUMMARY");
  lines.push("");
  lines.push(`Application: ${application?.type?.title || "Application"}`);
  lines.push(`Applicant: ${application?.user?.name || "Citizen"}`);
  lines.push(`Email: ${application?.user?.email || "-"}`);
  lines.push(`Submitted: ${application?.submittedAt || application?.createdAt || "-"}`);
  lines.push("");
  lines.push("Submitted data:");
  Object.entries(application?.fields || {}).forEach(([key, value]) => {
    lines.push(`- ${labelize(key)}: ${value || "-"}`);
  });
  lines.push("");
  lines.push("Required documents:");
  (application?.requiredDocuments || []).forEach((doc) => {
    lines.push(`- ${doc}`);
  });
  lines.push("");
  lines.push("Uploads:");
  Object.entries(application?.uploads || {}).forEach(([key, files]) => {
    (files || []).forEach((file) => {
      lines.push(`- ${key}: ${file?.title || "file"}`);
    });
  });
  lines.push("");
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  return lines.join("\n");
}
