export default function DoctorInboxSection({
  inboxTab,
  setInboxTab,
  inboxCounts,
  loadInbox,
  inboxLoading,
  inboxError,
  inboxItems,
  openDoc
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Incoming statements</h3>
          <p className="muted">Forms started by patients from Client Templates.</p>
        </div>
        <div className="panel-tabs fill-tabs">
          <button
            type="button"
            className={`tab-pill ${inboxTab === "action" ? "active" : ""}`}
            onClick={() => setInboxTab("action")}
          >
            Requires action <span className="tab-count">{inboxCounts.action}</span>
          </button>
          <button
            type="button"
            className={`tab-pill ${inboxTab === "completed" ? "active" : ""}`}
            onClick={() => setInboxTab("completed")}
          >
            Completed <span className="tab-count">{inboxCounts.completed}</span>
          </button>
          <button className="secondary" type="button" onClick={() => loadInbox()} disabled={inboxLoading}>
            Refresh
          </button>
        </div>
      </div>

      {inboxError && <p className="error-banner">Error: {inboxError}</p>}
      {inboxLoading && <p className="muted">Loading...</p>}
      {!inboxLoading && inboxItems.length === 0 && <p className="muted">No incoming statements yet.</p>}

      {!inboxLoading && inboxItems.length > 0 && (
        <div className="fill-grid">
          {inboxItems.map((item, idx) => (
            <article key={item.assignmentId || `${item.title}-${idx}`} className="fill-card">
              <div className={`fill-thumb fill-thumb-${item.status === "completed" ? "completed" : "action"}`} />
              <div className="fill-body">
                <h4>{item.title}</h4>
                <p className="muted">Patient: {item.patientName}</p>
                <p className="muted">{item.status === "completed" ? "Completed" : "In progress"}</p>
                <div className="fill-actions">
                  <button
                    className={item.status === "completed" ? "secondary" : "primary"}
                    type="button"
                    onClick={() => openDoc(item.title, item.openUrl)}
                    disabled={!item.openUrl}
                  >
                    {item.status === "completed" ? "View" : "Open"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

