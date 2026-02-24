import { useState } from "react";
import { toast } from "../utils/toast.js";

export default function Register({ busy, error, onRegister, onGoLogin }) {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: ""
  });

  const submit = (event) => {
    event.preventDefault();
    const payload = {
      fullName: String(form.fullName || "").trim(),
      email: String(form.email || "").trim(),
      phone: String(form.phone || "").trim(),
      password: String(form.password || "")
    };

    if (!payload.fullName) {
      toast.error("Please enter your full name.");
      return;
    }
    if (!payload.email) {
      toast.error("Please enter your email.");
      return;
    }
    if (!payload.phone) {
      toast.error("Please enter your phone number.");
      return;
    }
    if (!payload.password) {
      toast.error("Please create a password.");
      return;
    }
    if (payload.password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    onRegister(payload);
  };

  return (
    <div className="auth-layout auth-layout-centered">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" />
          City Clinic
        </div>
        <h1>Patient registration</h1>
        <p className="muted">Please fill out the form below to register at our clinic.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Full name
            <input
              type="text"
              placeholder="Emily Carter"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </label>
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
            Phone number
            <input
              type="tel"
              placeholder="+1 (415) 732-8491"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
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
              minLength={6}
            />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Registering..." : "Register"}
          </button>
        </form>
        {error && <div className="error-banner">Registration error: {error}</div>}
        <button className="link" onClick={onGoLogin}>
          Already have an account? Sign in
        </button>
        <div className="auth-support-inline">support@cityclinic.com</div>
      </div>
    </div>
  );
}

