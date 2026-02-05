export default function Templates({
  session,
  busy,
  error,
  templates,
  onBack,
  onLogout,
  onStartFlow
}) {
  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Templates</h2>
          <p className="muted">Forms room: {session?.formsRoom?.title || "—"}</p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={onBack} disabled={busy}>
            Back
          </button>
          <button type="button" className="link" onClick={onLogout} disabled={busy}>
            Sign out
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="card">
        <div className="card-header">
          <h3>Available templates</h3>
          <p className="muted">Loaded from the Templates folder of your DocSpace forms room.</p>
        </div>
        <div className="list">
          {!templates?.length ? (
            <p className="muted">No templates found.</p>
          ) : (
            templates.map((t) => (
              <div key={t.id} className="list-row">
                <div className="list-main">
                  <strong>{t.title || `File ${t.id}`}</strong>
                  <span className="muted">
                    ID: {t.id} {t.isForm ? "· Form" : ""} {t.fileExst ? `· ${t.fileExst}` : ""}
                  </span>
                </div>
                <div className="list-actions">
                  <button type="button" onClick={() => onStartFlow(t.id)} disabled={busy}>
                    Start flow
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

