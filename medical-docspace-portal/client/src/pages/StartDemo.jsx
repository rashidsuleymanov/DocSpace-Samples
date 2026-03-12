import { useState } from "react";
import { toast } from "../utils/toast.js";

export default function StartDemo({ busy, error, onStart }) {
  const [patientName, setPatientName] = useState("Demo Patient");

  const submit = (event) => {
    event.preventDefault();
    const name = String(patientName || "").trim() || "Demo Patient";
    onStart?.({ patientName: name });
  };

  return (
    <div className="auth-layout auth-layout-centered">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" />
          City Clinic
        </div>
        <h1>Start demo</h1>
        <p className="muted">
          This creates an anonymous demo workspace session. Data is deleted automatically after the session ends.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Patient name (optional)
            <input
              type="text"
              placeholder="Demo Patient"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            className="primary"
            type="submit"
            disabled={busy}
            onClick={() => {
              if (!onStart) toast.error("Start handler is missing.");
            }}
          >
            {busy ? "Starting..." : "Start demo"}
          </button>
        </form>
        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}

