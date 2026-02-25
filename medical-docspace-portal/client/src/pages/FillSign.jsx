import { useEffect, useMemo, useRef, useState } from "react";
import PatientShell from "../components/PatientShell.jsx";
import DocSpaceModal from "../components/DocSpaceModal.jsx";

function withFillAction(url) {
  const raw = String(url || "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.searchParams.set("action", "fill");
    return parsed.toString();
  } catch {
    return raw.includes("?") ? `${raw}&action=fill` : `${raw}?action=fill`;
  }
}

export default function FillSign({ session, onLogout, onNavigate, initialTab }) {
  const [tab, setTab] = useState("action");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [actionItems, setActionItems] = useState([]);
  const [completedItems, setCompletedItems] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState("");
  const [templates, setTemplates] = useState([]);
  const [requestingTemplateId, setRequestingTemplateId] = useState("");
  const [savingToContractsId, setSavingToContractsId] = useState("");
  const [docModal, setDocModal] = useState({ open: false, title: "", url: "" });
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const lastOpenedAssignmentIdRef = useRef("");
  const autoSaveSeqRef = useRef(0);
  const savedToContractsRef = useRef(new Set());

  useEffect(() => {
    const next = String(initialTab || "").trim().toLowerCase();
    if (!next) return;
    if (!["action", "completed", "templates"].includes(next)) return;
    setTab(next);
  }, [initialTab]);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError("");

      const token = session?.user?.token || "";
      if (!token) {
        setActionItems([]);
        setCompletedItems([]);
        return { action: [], completed: [] };
      }

      const headers = { Authorization: token };
      const [actionRes, completedRes] = await Promise.all([
        fetch("/api/patients/fill-sign/contents?tab=action", { headers }),
        fetch("/api/patients/fill-sign/contents?tab=completed", { headers })
      ]);

      const actionData = await actionRes.json().catch(() => ({}));
      const completedData = await completedRes.json().catch(() => ({}));
      if (!actionRes.ok) throw new Error(actionData?.error || "Failed to load Fill & Sign documents");
      if (!completedRes.ok) throw new Error(completedData?.error || "Failed to load Fill & Sign documents");

	      const mapFiles = (contents) =>
	        (contents?.items || [])
	          .filter((item) => item?.type === "file")
	          .map((item) => ({
	            id: item.id,
	            assignmentId: item.assignmentId || item.id || null,
	            title: item.title,
	            openUrl: item.openUrl || item.shareLink || "",
	            initiatedByType: item.initiatedByType || null,
	            initiatedByName: item.initiatedByName || item.initiatedBy || "City Clinic",
	            requestedBy: item.requestedBy || null,
	            formFillingStatus: item.formFillingStatus || null,
	            instanceFileId: item.instanceFileId || null,
	            created: item.created || null
	          }));

      const nextAction = mapFiles(actionData.contents);
      const nextCompleted = mapFiles(completedData.contents);
      setActionItems(nextAction);
      setCompletedItems(nextCompleted);
      setLastUpdatedAt(new Date().toISOString());
      return { action: nextAction, completed: nextCompleted };
    } catch (loadError) {
      setError(loadError.message || "Failed to load Fill & Sign documents");
      setActionItems([]);
      setCompletedItems([]);
      return { action: [], completed: [] };
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.token]);

  const items = useMemo(() => {
    if (tab === "action") return actionItems;
    if (tab === "completed") return completedItems;
    return [];
  }, [tab, actionItems, completedItems]);

  const badgeCounts = {
    fillSign: actionItems.length
  };

  const saveToContracts = async (item) => {
    const instanceFileId = String(item?.instanceFileId || "").trim();
    if (!instanceFileId) return;
    if (savedToContractsRef.current.has(instanceFileId)) {
      setInfo("Already saved to Contracts.");
      return;
    }
    setSavingToContractsId(instanceFileId);
    setError("");
    setInfo("");
    try {
      const token = session?.user?.token || "";
      if (!token) throw new Error("Authorization token is missing");
      const roomId = String(session?.room?.id || "").trim();
      if (!roomId) throw new Error("Patient room is missing");

      const res = await fetch("/api/patients/contracts/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token
        },
        body: JSON.stringify({ roomId, instanceFileId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);
      savedToContractsRef.current.add(instanceFileId);
      setInfo("Saved to Contracts.");
    } catch (e) {
      setError(e?.message || "Failed to save to Contracts");
    } finally {
      setSavingToContractsId("");
    }
  };

  const handleOpen = (item) => {
    const rawUrl = item?.openUrl || item?.url || item?.webUrl || "";
    const url = tab === "action" ? withFillAction(rawUrl) : String(rawUrl || "");
    if (!url) return;
    lastOpenedAssignmentIdRef.current = String(item?.assignmentId || item?.id || "");
    setDocModal({ open: true, title: item.title || "Document", url });
  };

  const cancelStatement = async (item) => {
    try {
      const token = session?.user?.token || "";
      if (!token) return;
      const assignmentId = String(item?.assignmentId || "").trim();
      if (!assignmentId) return;
      setError("");
      setInfo("");
      const res = await fetch("/api/patients/fill-sign/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token
        },
        body: JSON.stringify({ assignmentId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Cancel failed (${res.status})`);
      setInfo("Statement canceled.");
      await loadItems();
    } catch (e) {
      setError(e?.message || "Failed to cancel statement");
    }
  };

  const declineDoctorRequest = async (item) => {
    try {
      const token = session?.user?.token || "";
      if (!token) return;
      const assignmentId = String(item?.assignmentId || "").trim();
      if (!assignmentId) return;
      setError("");
      setInfo("");
      const res = await fetch("/api/patients/fill-sign/decline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token
        },
        body: JSON.stringify({ assignmentId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Decline failed (${res.status})`);
      setInfo("Request declined.");
      await loadItems();
    } catch (e) {
      setError(e?.message || "Failed to decline request");
    }
  };

  const handleDocModalClose = () => {
    setDocModal({ open: false, title: "", url: "" });
    // Workspace can update folder/status asynchronously after closing the editor;
    // refresh twice to avoid requiring a full page reload.
    loadItems();
    const seq = (autoSaveSeqRef.current += 1);
    const targetAssignmentId = String(lastOpenedAssignmentIdRef.current || "").trim();
    if (!targetAssignmentId) return;

    setTimeout(async () => {
      const delays = [1500, 2500, 3500, 4500, 6000];
      for (const delay of delays) {
        await new Promise((r) => setTimeout(r, delay));
        if (autoSaveSeqRef.current !== seq) return;

        const { action, completed } = await loadItems();
        const match = [...completed, ...action].find(
          (i) => String(i?.assignmentId || i?.id || "") === targetAssignmentId
        );
        if (match?.instanceFileId) {
          await saveToContracts(match);
          return;
        }
      }
    }, 0);
  };

  const loadTemplates = async () => {
    try {
      setTemplatesLoading(true);
      setTemplatesError("");
      const token = session?.user?.token || "";
      if (!token) {
        setTemplates([]);
        return;
      }
      const headers = { Authorization: token };
      const res = await fetch("/api/patients/fill-sign/client-templates", { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load client templates");
      }
      setTemplates(Array.isArray(data?.files) ? data.files : []);
    } catch (e) {
      setTemplates([]);
      setTemplatesError(e?.message || "Failed to load client templates");
    } finally {
      setTemplatesLoading(false);
    }
  };

  const requestTemplate = async (templateFileId) => {
    try {
      const token = session?.user?.token || "";
      if (!token) return;
      setRequestingTemplateId(String(templateFileId || ""));
      setTemplatesError("");
      const res = await fetch("/api/patients/fill-sign/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token
        },
        body: JSON.stringify({ templateFileId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      // Match doctor flow UX: the statement appears under "Requires action",
      // and the user opens it via "Open & Sign" (which forces fill mode).
      setTab("action");
      await loadItems();
    } catch (e) {
      setTemplatesError(e?.message || "Failed to start form");
    } finally {
      setRequestingTemplateId("");
    }
  };

  return (
    <PatientShell
      user={session.user}
      badgeCounts={badgeCounts}
      onLogout={onLogout}
      onNavigate={onNavigate}
      active="fill-sign"
      roomId={session?.room?.id}
      token={session?.user?.token}
    >
      <section className="page">
        <header className="page-header">
          <div>
            <h1>Fill &amp; Sign</h1>
            <p className="muted">
              {tab === "templates"
                ? "Create a new statement and fill it out."
                : "Documents shared by your doctor for filling and signing."}
            </p>
            {lastUpdatedAt && <p className="muted">Last updated: {new Date(lastUpdatedAt).toLocaleString("en-US")}</p>}
          </div>
          <div className="page-tabs">
            <button
              type="button"
              className={`tab-pill ${tab === "action" ? "active" : ""}`}
              onClick={() => setTab("action")}
            >
              Requires action <span className="tab-count">{actionItems.length}</span>
            </button>
            <button
              type="button"
              className={`tab-pill ${tab === "completed" ? "active" : ""}`}
              onClick={() => setTab("completed")}
            >
              Completed <span className="tab-count">{completedItems.length}</span>
            </button>
            <button
              type="button"
              className={`tab-pill ${tab === "templates" ? "active" : ""}`}
              onClick={() => setTab("templates")}
            >
              Statements <span className="tab-count">{templates.length}</span>
            </button>
            <button
              className="secondary"
              type="button"
              onClick={tab === "templates" ? loadTemplates : loadItems}
              disabled={tab === "templates" ? templatesLoading : loading}
            >
              Refresh
            </button>
          </div>
        </header>

        {tab !== "templates" && error && <p className="error-banner">Error: {error}</p>}
        {tab !== "templates" && info && <p className="success-banner">{info}</p>}
        {tab !== "templates" && loading && <p className="muted">Loading...</p>}
        {tab === "templates" && templatesError && <p className="error-banner">Error: {templatesError}</p>}
        {tab === "templates" && templatesLoading && <p className="muted">Loading templates...</p>}

        {tab !== "templates" && !loading && items.length === 0 && (
          <p className="muted">No documents in this section yet.</p>
        )}

        {tab !== "templates" && !loading && items.length > 0 && (
	          <div className="fill-grid">
	            {items.map((item, index) => (
	              <article key={item.assignmentId || `${item.id || "item"}-${index}`} className="fill-card">
                <div className={`fill-thumb fill-thumb-${tab === "action" ? "action" : "completed"}`} />
                <div className="fill-body">
                  <h4>{item.title}</h4>
                  <p className="muted">
                    {tab === "action" ? "Waiting for your signature" : "Completed"}
                  </p>
                  <p className="muted fill-initiated" title={`Initiated by: ${item.initiatedByName || "City Clinic"}`}>
                    Initiated by: {item.initiatedByName || "City Clinic"}
                  </p>
	                  <div className="fill-actions">
	                    <button
	                      className={tab === "action" ? "primary" : "secondary"}
	                      type="button"
	                      onClick={() => handleOpen(item)}
	                      disabled={!item.openUrl}
	                    >
	                      {tab === "action" ? "Open & Sign" : "View"}
	                    </button>
                      {tab === "completed" && (
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => saveToContracts(item)}
                          disabled={!item.instanceFileId || savingToContractsId === String(item.instanceFileId)}
                          title={!item.instanceFileId ? "Preparing document..." : "Save the completed document to Contracts"}
                        >
                          {!item.instanceFileId
                            ? "Preparing..."
                            : savingToContractsId === String(item.instanceFileId)
                              ? "Saving..."
                              : "Save to Contracts"}
                        </button>
                      )}
                      {tab === "action" && item.initiatedByType === "patient" && (
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => {
                            const ok = window.confirm("Cancel this statement?");
                            if (!ok) return;
                            cancelStatement(item);
                          }}
                        >
                          Cancel
                        </button>
                      )}
                      {tab === "action" && item.initiatedByType === "clinic" && (
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => {
                            const ok = window.confirm("Decline this request?");
                            if (!ok) return;
                            declineDoctorRequest(item);
                          }}
                        >
                          Decline
                        </button>
                      )}
	                  </div>
	                </div>
	              </article>
	            ))}
	          </div>
	        )}

        {tab === "templates" && !templatesLoading && templates.length === 0 && (
          <p className="muted">
            No statements found. Create a folder named <strong>Client Templates</strong> in the Forms room and put
            statement files there.
          </p>
        )}

        {tab === "templates" && !templatesLoading && templates.length > 0 && (
          <div className="fill-grid">
            {templates.map((tpl) => (
              <article key={tpl.id} className="fill-card">
                <div className="fill-thumb fill-thumb-action" />
                <div className="fill-body">
                  <h4>{tpl.title}</h4>
                  <p className="muted">Statement</p>
                  <div className="fill-actions">
                    <button
                      className="primary"
                      type="button"
                      onClick={() => requestTemplate(tpl.id)}
                      disabled={!tpl?.id || Boolean(requestingTemplateId)}
                      title="Starts a new Fill & Sign instance"
                    >
                      {requestingTemplateId === String(tpl.id) ? "Starting..." : "Start"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <DocSpaceModal
        open={docModal.open}
        title={docModal.title}
        url={docModal.url}
        onClose={handleDocModalClose}
      />
    </PatientShell>
  );
}
