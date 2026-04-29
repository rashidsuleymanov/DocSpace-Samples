export default function StartDemo({ busy, error, onStart }) {
  return (
    <div className="auth-layout auth-layout-centered">
      <div className="auth-card auth-card--wide auth-card--minimal">
        <div className="auth-brand">
          <span className="brand-mark" />
          Northstar Client Portal
        </div>
        <div className="start-demo-copy">
          <h1>Try demo</h1>
          <p className="muted">
            Launch a client workspace with manager review.
          </p>
        </div>

        <div className="auth-actions">
          <button
            className="primary"
            type="button"
            disabled={busy}
            onClick={() =>
              onStart?.({
                clientName: "Avery Parker",
                companyName: "Northwind Labs",
                managerName: "Morgan Lee"
              })
            }
          >
            {busy ? "Provisioning workspace..." : "Start demo"}
          </button>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        <p className="muted start-demo-hint">
          This is a demonstration stand.<br />
          No data is saved and will be deleted after the session ends.
        </p>
      </div>
    </div>
  );
}
