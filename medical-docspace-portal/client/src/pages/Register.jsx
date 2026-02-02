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
              placeholder="Введите пароль"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Registering..." : "Register"}
          </button>
        </form>
        {error && <p className="muted">Ошибка регистрации: {error}</p>}
        <button className="link" onClick={onGoLogin}>
          Already have an account? Sign in
        </button>
      </div>
      <div className="auth-visual">
        <div className="auth-support">
          <span>support@cityclinic.com</span>
        </div>
      </div>
    </div>
  );
}

