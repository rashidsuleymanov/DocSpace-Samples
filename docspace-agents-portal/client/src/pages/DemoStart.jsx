import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/http.js";
import { useSession } from "../services/session.js";

export default function DemoStart() {
  const nav = useNavigate();
  const session = useSession();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // If already in demo session, go straight to Studio.
  useEffect(() => {
    if (!session.loading && session.isAuthed && session.isDemo) {
      nav("/studio", { replace: true });
    }
  }, [session.loading, session.isAuthed, session.isDemo, nav]);

  async function startDemo(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/demo/start", {
        method: "POST",
        body: { name: name.trim() || "Demo User" }
      });
      await session.refresh();
      nav("/studio", { replace: true });
    } catch (err) {
      setError(err?.message || "Failed to start demo. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (session.loading) return null;

  return (
    <div className="container home" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", paddingTop: 0 }}>
      <div className="demo-start-card">
        <div className="demo-start-brand">
          <div className="home-brand-mark">A</div>
          <div>
            <div className="home-brand-title">Agents</div>
            <div className="home-brand-sub">Studio + Widget</div>
          </div>
        </div>

        <h1 className="demo-start-title">Попробуйте демо</h1>
        <div className="demo-start-sub">
          Получите готовый агент с базой знаний — без регистрации. Демо-сессия активна 30 минут.
        </div>

        <form onSubmit={startDemo} className="demo-start-form">
          <div className="field">
            <label htmlFor="demo-name">Как вас зовут? (необязательно)</label>
            <input
              id="demo-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ваше имя"
              maxLength={100}
              disabled={loading}
            />
          </div>

          {error ? <div className="demo-start-error">{error}</div> : null}

          <button className="btn" type="submit" disabled={loading} style={{ width: "100%", height: 46 }}>
            {loading ? "Запуск…" : "Начать демо"}
          </button>
        </form>

        <div className="demo-start-note">
          Сессия автоматически завершается через 30 минут или при закрытии вкладки.
        </div>
      </div>
    </div>
  );
}
