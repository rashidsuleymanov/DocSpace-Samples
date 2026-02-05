import { useMemo, useState } from "react";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import StatCard from "../components/StatCard.jsx";

export default function Dashboard({
  session,
  busy,
  error,
  flows,
  onLogout,
  onOpenTemplates,
  onRefresh
}) {
  const [open, setOpen] = useState(false);
  const [modalUrl, setModalUrl] = useState("");
  const [modalTitle, setModalTitle] = useState("Document");

  const stats = useMemo(() => {
    const items = Array.isArray(flows) ? flows : [];
    const inProgress = items.filter((f) => f.status === "InProgress").length;
    const completed = items.filter((f) => f.status === "Completed").length;
    const other = items.length - inProgress - completed;
    return { total: items.length, inProgress, completed, other };
  }, [flows]);

  const openFlow = (flow) => {
    const url = String(flow?.openUrl || "").trim();
    if (!url) return;
    setModalTitle(flow?.templateTitle || "Document");
    setModalUrl(url);
    setOpen(true);
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Dashboard</h2>
          <p className="muted">
            Signed in as {session?.user?.displayName || session?.user?.email || "DocSpace user"}
          </p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={onRefresh} disabled={busy}>
            Refresh
          </button>
          <button type="button" onClick={onOpenTemplates} disabled={busy}>
            Templates
          </button>
          <button type="button" className="link" onClick={onLogout} disabled={busy}>
            Sign out
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="stats-grid">
        <StatCard title="In progress" value={stats.inProgress} meta="Your started flows" />
        <StatCard title="Completed" value={stats.completed} meta="Not implemented yet" />
        <StatCard title="Other" value={stats.other} meta="Pending / declined" />
        <StatCard title="Total" value={stats.total} meta="All flows" />
      </section>

      <section className="card">
        <div className="card-header">
          <h3>Flows</h3>
          <p className="muted">Started from templates (tracked locally in this sample).</p>
        </div>
        <div className="list">
          {!flows?.length ? (
            <p className="muted">No flows yet. Create one from Templates.</p>
          ) : (
            flows.map((flow) => (
              <div key={flow.id} className="list-row">
                <div className="list-main">
                  <strong>{flow.templateTitle || `Template ${flow.templateFileId}`}</strong>
                  <span className="muted">
                    Status: {flow.status} · Created: {(flow.createdAt || "").slice(0, 19).replace("T", " ")}
                  </span>
                </div>
                <div className="list-actions">
                  <button type="button" onClick={() => openFlow(flow)} disabled={!flow.openUrl}>
                    Open
                  </button>
                  {flow.openUrl ? (
                    <a className="link" href={flow.openUrl} target="_blank" rel="noreferrer">
                      New tab
                    </a>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

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

