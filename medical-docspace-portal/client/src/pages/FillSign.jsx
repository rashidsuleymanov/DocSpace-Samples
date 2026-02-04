import { useEffect, useMemo, useState } from "react";
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

export default function FillSign({ session, onLogout, onNavigate }) {
  const [tab, setTab] = useState("action");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionItems, setActionItems] = useState([]);
  const [completedItems, setCompletedItems] = useState([]);
  const [docModal, setDocModal] = useState({ open: false, title: "", url: "" });
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");

  const loadItems = async () => {
    try {
      setLoading(true);
      setError("");

      const token = session?.user?.token || "";
      if (!token) {
        setActionItems([]);
        setCompletedItems([]);
        return;
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
            initiatedBy: "City Clinic",
            formFillingStatus: item.formFillingStatus || null,
            created: item.created || null
          }));

      setActionItems(mapFiles(actionData.contents));
      setCompletedItems(mapFiles(completedData.contents));
      setLastUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      setError(loadError.message || "Failed to load Fill & Sign documents");
      setActionItems([]);
      setCompletedItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.token]);

  const items = useMemo(
    () => (tab === "action" ? actionItems : completedItems),
    [tab, actionItems, completedItems]
  );

  const badgeCounts = {
    fillSign: actionItems.length
  };

  const handleOpen = (item) => {
    const rawUrl = item?.openUrl || item?.url || item?.webUrl || "";
    const url = tab === "action" ? withFillAction(rawUrl) : String(rawUrl || "");
    if (!url) return;
    setDocModal({ open: true, title: item.title || "Document", url });
  };

  const handleDocModalClose = () => {
    setDocModal({ open: false, title: "", url: "" });
    // DocSpace can update folder/status asynchronously after closing the editor;
    // refresh twice to avoid requiring a full page reload.
    loadItems();
    setTimeout(() => loadItems(), 1500);
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
            <p className="muted">Documents shared by your doctor for filling and signing.</p>
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
            <button className="secondary" type="button" onClick={loadItems} disabled={loading}>
              Refresh
            </button>
          </div>
        </header>

        {error && <p className="error-banner">Error: {error}</p>}
        {loading && <p className="muted">Loading...</p>}

        {!loading && items.length === 0 && <p className="muted">No documents in this section yet.</p>}

        {!loading && items.length > 0 && (
          <div className="fill-grid">
            {items.map((item, index) => (
              <article key={item.assignmentId || `${item.id || "item"}-${index}`} className="fill-card">
                <div className={`fill-thumb fill-thumb-${tab === "action" ? "action" : "completed"}`} />
                <div className="fill-body">
                  <h4>{item.title}</h4>
                  <p className="muted">
                    {tab === "action" ? "Waiting for your signature" : "Completed"}
                  </p>
                  <p className="muted">Initiated by: {item.initiatedBy}</p>
                  <div className="fill-actions">
                    <button
                      className={tab === "action" ? "primary" : "secondary"}
                      type="button"
                      onClick={() => handleOpen(item)}
                      disabled={!item.openUrl}
                    >
                      {tab === "action" ? "Open & Sign" : "View"}
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
