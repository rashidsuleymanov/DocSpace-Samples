import { useEffect, useMemo, useState } from "react";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import {
  closeOfficerApplication,
  createOfficerRequest,
  getOfficerApplication,
  issueOfficerDocx,
  listOfficerApplications,
  listOfficerRequests
} from "../services/officerApi.js";

export default function OfficerPortal({ actor, credentialsUrl }) {
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [details, setDetails] = useState(null);
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [docModal, setDocModal] = useState({
    open: false,
    title: "",
    url: "",
    fileId: ""
  });
  const [requestForm, setRequestForm] = useState({
    title: "Missing commercial approval",
    periodFrom: "",
    periodTo: "",
    requiredDocuments: "Signed NDA, Billing contact sheet"
  });

  useEffect(() => {
    const load = async () => {
      try {
        const items = await listOfficerApplications();
        setProjects(items);
        if (items?.[0]?.id) {
          setActiveId(items[0].id);
        }
      } catch (loadError) {
        setError(loadError?.message || "Failed to load submitted packages");
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!activeId) {
      setDetails(null);
      return;
    }
    const load = async () => {
      try {
        const data = await getOfficerApplication(activeId);
        setDetails(data.application || null);
        setError("");
      } catch (loadError) {
        setError(loadError?.message || "Failed to load package details");
      }
    };
    load();
  }, [activeId]);

  useEffect(() => {
    if (!details?.roomId) {
      setRequests([]);
      return;
    }
    const load = async () => {
      try {
        const items = await listOfficerRequests(details.roomId);
        setRequests(items);
      } catch {
        setRequests([]);
      }
    };
    load();
  }, [details?.roomId]);

  const pendingCount = useMemo(
    () => projects.filter((item) => item.status === "Submitted").length,
    [projects]
  );

  const openDocument = (doc) => {
    setDocModal({
      open: true,
      title: doc?.title || "Document",
      url: doc?.url || "",
      fileId: doc?.id || ""
    });
  };

  const completePackage = async () => {
    if (!details?.id) return;
    setBusy(true);
    setError("");
    try {
      const result = await issueOfficerDocx(details.id);
      const file = result?.file || null;
      const completed = await closeOfficerApplication({
        applicationId: details.id,
        issuedDocument: file
      });
      setDetails(completed);
      setProjects((items) => items.map((item) => (item.id === completed.id ? completed : item)));
      if (file) {
        openDocument(file);
      }
    } catch (completeError) {
      setError(completeError?.message || "Failed to complete package");
    } finally {
      setBusy(false);
    }
  };

  const sendActionItem = async (event) => {
    event.preventDefault();
    if (!details?.roomId) return;
    setBusy(true);
    setError("");
    try {
      const requiredDocuments = String(requestForm.requiredDocuments || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const created = await createOfficerRequest({
        roomId: details.roomId,
        title: requestForm.title,
        periodFrom: requestForm.periodFrom,
        periodTo: requestForm.periodTo,
        requiredDocuments
      });
      setRequests((items) => [created, ...items]);
    } catch (requestError) {
      setError(requestError?.message || "Failed to create action item");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="hero-panel hero-panel--compact">
        <div className="hero-panel__copy">
          <span className="eyebrow">Internal collaboration</span>
          <h1>Manager review queue</h1>
          <p className="muted">
            The manager hub runs on the same room but exposes the internal review workflow: inspect what
            the client submitted, request missing assets, and publish a final package summary.
          </p>
        </div>
        <div className="hero-panel__meta">
          <div className="hero-badge">
            <strong>{pendingCount} packages</strong>
            <span>Awaiting manager review</span>
          </div>
        </div>
      </section>

      <section className="content-panel manager-grid">
        <aside className="manager-queue">
          <div className="panel-head">
            <div>
              <h3>Submitted packages</h3>
              <p className="muted">Switch between active submissions and completed handovers.</p>
            </div>
          </div>
          {projects.length === 0 ? <p className="muted">No submitted packages yet.</p> : null}
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
                <span className="muted small">{item.user?.name || "Client"}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="manager-detail">
          {error ? <p className="muted">Error: {error}</p> : null}
          {!details ? <p className="muted">Select a package to review.</p> : null}

          {details ? (
            <section className="detail-stack">
              <article className="content-panel content-panel--nested">
                <div className="panel-head">
                  <div>
                    <h3>{details.type?.title}</h3>
                    <p className="muted">
                      Client: {details.user?.name || "Client"} • {details.user?.email || "—"}
                    </p>
                  </div>
                  {details.status !== "Completed" ? (
                    <button className="primary" type="button" onClick={completePackage} disabled={busy}>
                      {busy ? "Completing..." : "Complete package"}
                    </button>
                  ) : null}
                </div>

                <div className="split-grid">
                  <div>
                    <h4>Client brief</h4>
                    <ul className="data-list">
                      {Object.entries(details.fields || {}).map(([key, value]) => (
                        <li key={key}>
                          <span className="muted">{labelize(key)}</span>
                          <strong>{value || "—"}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4>Generated starter docs</h4>
                    <ul className="content-list">
                      {(details.documents || []).map((doc) => (
                        <li key={doc.id || doc.title} className="content-item file" onClick={() => openDocument(doc)}>
                          <span className="content-icon" />
                          <span className="content-title">{doc.title}</span>
                          <span className="muted small">Open</span>
                        </li>
                      ))}
                    </ul>

                    <h4>Uploaded client files</h4>
                    <ul className="content-list">
                      {Object.entries(details.uploads || {}).flatMap(([key, files]) =>
                        (files || []).map((file) => (
                          <li
                            key={`${key}-${file.id || file.title}`}
                            className="content-item file"
                            onClick={() => openDocument(file)}
                          >
                            <span className="content-icon" />
                            <span className="content-title">{file.title || key}</span>
                            <span className="muted small">{key}</span>
                          </li>
                        ))
                      )}
                    </ul>

                    {details.issuedDocument?.id || details.issuedDocument?.url ? (
                      <>
                        <h4>Manager summary</h4>
                        <ul className="content-list">
                          <li className="content-item file" onClick={() => openDocument(details.issuedDocument)}>
                            <span className="content-icon" />
                            <span className="content-title">
                              {details.issuedDocument.title || "Manager Summary"}
                            </span>
                            <span className="muted small">Open</span>
                          </li>
                        </ul>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>

              <article className="content-panel content-panel--nested">
                <div className="panel-head">
                  <div>
                    <h3>Create action item</h3>
                    <p className="muted">Request anything still missing before closing the package.</p>
                  </div>
                </div>

                <form className="form-grid" onSubmit={sendActionItem}>
                  <label>
                    Title
                    <input
                      type="text"
                      value={requestForm.title}
                      onChange={(event) => setRequestForm((prev) => ({ ...prev, title: event.target.value }))}
                      required
                    />
                  </label>
                  <div className="split-grid split-grid--tight">
                    <label>
                      Start
                      <input
                        type="date"
                        value={requestForm.periodFrom}
                        onChange={(event) =>
                          setRequestForm((prev) => ({ ...prev, periodFrom: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Deadline
                      <input
                        type="date"
                        value={requestForm.periodTo}
                        onChange={(event) =>
                          setRequestForm((prev) => ({ ...prev, periodTo: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Requested files
                    <input
                      type="text"
                      value={requestForm.requiredDocuments}
                      onChange={(event) =>
                        setRequestForm((prev) => ({ ...prev, requiredDocuments: event.target.value }))
                      }
                    />
                  </label>
                  <button className="secondary" type="submit" disabled={busy}>
                    {busy ? "Sending..." : "Send action item"}
                  </button>
                </form>

                <div className="request-grid">
                  {requests.map((request) => (
                    <article key={request.id} className="request-card">
                      <div className="application-card-head">
                        <strong>{request.title}</strong>
                        <span className={`status-chip ${request.status === "Completed" ? "success" : ""}`}>
                          {request.status}
                        </span>
                      </div>
                      <span className="muted small">
                        {request.periodFrom || "Open"} to {request.periodTo || "Flexible"}
                      </span>
                    </article>
                  ))}
                </div>
              </article>
            </section>
          ) : null}
        </div>
      </section>

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

function labelize(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
