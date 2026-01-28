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
          DocFlow
        </div>
        <h1>Welcome back</h1>
        <p className="muted">
          Sign in to manage government requests, applications, and documents.
        </p>
        <form className="auth-form" onSubmit={submit}>
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
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
        {success && <p className="muted">{success}</p>}
        {error && <p className="muted">Login error: {error}</p>}
        <button className="link" onClick={onGoRegister}>
          Create a new account
        </button>
        <button className="link" type="button" onClick={onGoOfficer}>
          Officer workspace
        </button>
      </div>
      <div className="auth-panel">
        <h2>One portal. All your bureaucratic paperwork.</h2>
        <ul>
          <li>Automatic DocSpace room per citizen</li>
          <li>Requests, forms, and uploads in one folder</li>
          <li>Government officers review everything in one view</li>
        </ul>
        <div className="auth-gradient" />
      </div>
    </div>
  );
}

