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
          DocFlow
        </div>
        <h1>Create account</h1>
        <p className="muted">
          We will create a DocSpace user and a personal document room automatically.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Full name
            <input
              type="text"
              placeholder="Anna Schmidt"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              placeholder="citizen@example.com"
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
            Password
            <input
              type="password"
              placeholder="Create a password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Registering..." : "Create account"}
          </button>
        </form>
        {error && <p className="muted">Registration error: {error}</p>}
        <button className="link" onClick={onGoLogin}>
          Back to sign in
        </button>
      </div>
      <div className="auth-panel">
        <h2>Designed for modern public services</h2>
        <ul>
          <li>Data synchronized with DocSpace profile</li>
          <li>Folders prepared for requests and uploads</li>
          <li>Audit-friendly citizen workspace</li>
        </ul>
        <div className="auth-gradient" />
      </div>
    </div>
  );
}

