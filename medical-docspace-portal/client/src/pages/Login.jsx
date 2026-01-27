import { useState } from "react";

export default function Login({ busy, error, success, onLogin, onGoRegister, onGoDoctor }) {
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
          DocSpace Medical
        </div>
        <h1>Welcome back</h1>
        <p className="muted">
          Sign in to access your patient room, medical records, and appointments.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              placeholder="patient@clinic.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              placeholder="Введите пароль"
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
        {error && <p className="muted">Ошибка входа: {error}</p>}
        <button className="link" onClick={onGoRegister}>
          Create a new patient account
        </button>
        <button className="link" type="button" onClick={onGoDoctor}>
          Doctor portal
        </button>
      </div>
      <div className="auth-panel">
        <h2>One portal. All patient documents.</h2>
        <ul>
          <li>Personalized DocSpace room for each patient</li>
          <li>Secure sharing of lab results and prescriptions</li>
          <li>Automated folder structure on registration</li>
        </ul>
        <div className="auth-gradient" />
      </div>
    </div>
  );
}

