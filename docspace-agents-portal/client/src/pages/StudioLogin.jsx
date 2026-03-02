import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../services/http.js";

export default function StudioLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const next = useMemo(() => location?.state?.from || "/studio", [location]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/auth/login", { method: "POST", body: { email, password } });
      navigate(next, { replace: true });
    } catch (err) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
          <div className="card-pad">
          <div className="title">Sign in</div>
          <p className="muted">Use your workspace account to manage agents.</p>
          <form onSubmit={onSubmit} className="field" style={{ maxWidth: 420 }}>
            <label>Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              required
            />
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              required
            />
            <div className="row" style={{ justifyContent: "flex-start", marginTop: 10 }}>
              <button className="btn" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </div>
            {error ? <div style={{ color: "#b91c1c", marginTop: 8 }}>{error}</div> : null}
          </form>
        </div>
      </div>
    </div>
  );
}
