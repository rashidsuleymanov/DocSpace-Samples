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
          <span className="brand-mark" />
          City Clinic
        </div>
        <h1>Patient sign in</h1>
        <p className="muted">
          Sign in to access your medical room, documents, and upcoming appointments.
        </p>
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
              placeholder="Введите пароль"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
          <button className="secondary" type="button">
            Sign in with Google
          </button>
        </form>
        {success && <p className="muted">{success}</p>}
        {error && <p className="muted">Ошибка входа: {error}</p>}
        <div className="auth-footer">
          <button className="link" onClick={onGoRegister}>
            Create a new patient account
          </button>
          <button className="link" type="button" onClick={onGoDoctor}>
            Doctor portal
          </button>
        </div>
      </div>
      <div className="auth-visual">
        <div className="auth-support">
          <span>support@cityclinic.com</span>
        </div>
      </div>
    </div>
  );
}

