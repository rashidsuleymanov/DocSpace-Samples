export default function Login({ busy, error, onLogin }) {
  const handleSubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "").trim();
    await onLogin({ email, password });
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Approval portal</h1>
        <p className="muted">Sign in with your DocSpace account.</p>
        {error ? <p className="error">{error}</p> : null}
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required disabled={busy} />
          </label>
          <label>
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

