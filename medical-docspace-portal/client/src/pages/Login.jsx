import { useState } from "react";
import { toast } from "../utils/toast.js";

export default function Login({ busy, error, success, onLogin, onGoRegister, onGoDoctor }) {
  const [form, setForm] = useState({ email: "", password: "" });

  const submit = (event) => {
    event.preventDefault();
    const email = String(form.email || "").trim();
    const password = String(form.password || "");
    if (!email) {
      toast.error("Please enter your email.");
      return;
    }
    if (!password) {
      toast.error("Please enter your password.");
      return;
    }
    onLogin({ email, password });
  };

  return (
    <div className="auth-layout auth-layout-centered">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" />
          City Clinic
        </div>
        <h1>Patient sign in</h1>
        <p className="muted">Sign in to access your medical room, documents, and upcoming appointments.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              placeholder="emily.carter@maildemo.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
          <button className="secondary" type="button" disabled title="Coming soon">
            Sign in with Google (coming soon)
          </button>
        </form>
        {success && <div className="success-banner">{success}</div>}
        {error && <div className="error-banner">Sign-in error: {error}</div>}
        <div className="auth-footer">
          <button className="link" onClick={onGoRegister}>
            Create a new patient account
          </button>
          <button className="link" type="button" onClick={onGoDoctor}>
            Doctor portal
          </button>
          <div className="auth-support-inline">support@cityclinic.com</div>
        </div>
      </div>
    </div>
  );
}

