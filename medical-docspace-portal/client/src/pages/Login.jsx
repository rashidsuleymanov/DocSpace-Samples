import { useState } from "react";
import { toast } from "../utils/toast.js";

export default function Login({ busy, error, success, onLogin, onGoRegister }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [role, setRole] = useState("patient");

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
    onLogin({ email, password, role });
  };

  return (
    <div className="auth-layout auth-layout-centered">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" />
          City Clinic
        </div>
        <h1>{role === "doctor" ? "Doctor sign in" : "Patient sign in"}</h1>
        <p className="muted">
          {role === "doctor"
            ? "Sign in to access patient rooms, documents, and requests."
            : "Sign in to access your medical room, documents, and upcoming appointments."}
        </p>
        <div className="mode-toggle" role="tablist" aria-label="Sign in role">
          <button
            className={`mode-pill ${role === "patient" ? "active" : ""}`}
            type="button"
            onClick={() => setRole("patient")}
            disabled={busy}
          >
            Patient
          </button>
          <button
            className={`mode-pill ${role === "doctor" ? "active" : ""}`}
            type="button"
            onClick={() => setRole("doctor")}
            disabled={busy}
          >
            Doctor
          </button>
        </div>
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
        </form>
        {success && <div className="success-banner">{success}</div>}
        {error && <div className="error-banner">Sign-in error: {error}</div>}
        <div className="auth-footer">
          <button className="link" onClick={onGoRegister}>
            Create a new patient account
          </button>
          <div className="auth-support-inline">support@cityclinic.com</div>
        </div>
      </div>
    </div>
  );
}
