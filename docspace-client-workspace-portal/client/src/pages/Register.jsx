import { useState } from "react";

export default function Register({ busy, error, onRegister, onGoLogin }) {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: ""
  });

  const submit = (event) => {
    event.preventDefault();
    onRegister(form);
  };

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-dot" />
          Client Workspace Portal
        </div>
        <h1>Create client workspace</h1>
        <p className="muted">
          This demo provisions a DocSpace user, creates a dedicated client room, and shares it with the manager team.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Client name
            <input
              type="text"
              placeholder="Anna Schmidt"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </label>
          <label>
            Client email
            <input
              type="email"
              placeholder="client@acme.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label>
            Phone
            <input
              type="tel"
              placeholder="+49 111 222 333"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label>
            Temporary password
            <input
              type="password"
              placeholder="Create a password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Provisioning..." : "Create workspace"}
          </button>
        </form>
        {error && <p className="muted">Setup error: {error}</p>}
        <button className="link" type="button" onClick={onGoLogin}>
          Back to sign in
        </button>
      </div>
      <div className="auth-panel">
        <h2>A ready-to-share room in one step</h2>
        <ul>
          <li>Creates the client user in DocSpace</li>
          <li>Builds a structured workspace with the right folders</li>
          <li>Shares the room with the configured account manager automatically</li>
        </ul>
        <div className="auth-gradient" />
      </div>
    </div>
  );
}
