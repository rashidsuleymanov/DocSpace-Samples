import { useState } from "react";

export default function Login({ busy, error, success, onLogin, onGoRegister, onGoOfficer }) {
  const [form, setForm] = useState({ email: "", password: "" });

  const submit = (event) => {
    event.preventDefault();
    onLogin(form);
  };

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-dot" />
          Client Workspace Portal
        </div>
        <h1>Client access</h1>
        <p className="muted">
          Sign in to review your shared documents, upload requested files, and follow active projects.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              placeholder="client@acme.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              placeholder="Enter password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Open workspace"}
          </button>
        </form>
        {success && <p className="muted">{success}</p>}
        {error && <p className="muted">Login error: {error}</p>}
        <button className="link" type="button" onClick={onGoRegister}>
          Create a new client workspace
        </button>
        <button className="link" type="button" onClick={onGoOfficer}>
          Open manager hub
        </button>
      </div>
      <div className="auth-panel">
        <h2>Secure project rooms for every client account</h2>
        <ul>
          <li>Automatic DocSpace room provisioning per client</li>
          <li>Shared documents, action items, and projects in one place</li>
          <li>Managers keep full control while clients see only their workspace</li>
        </ul>
        <div className="auth-gradient" />
      </div>
    </div>
  );
}
