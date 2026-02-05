import { useEffect, useMemo, useState } from "react";
import Dashboard from "./pages/Dashboard.jsx";
import Login from "./pages/Login.jsx";
import Templates from "./pages/Templates.jsx";
import { clearSession, loadSession, saveSession } from "./services/session.js";
import { createFlowFromTemplate, listFlows, listTemplates, login } from "./services/portalApi.js";

export default function App() {
  const [view, setView] = useState("login");
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState([]);
  const [flows, setFlows] = useState([]);

  useEffect(() => {
    const existing = loadSession();
    if (existing?.token && existing?.user?.id) {
      setSession(existing);
      setView("dashboard");
    }
    setBooting(false);
  }, []);

  const refreshFlows = useMemo(
    () => async (active) => {
      if (!active?.user?.id) return;
      const data = await listFlows({ userId: active.user.id });
      setFlows(Array.isArray(data?.flows) ? data.flows : []);
    },
    []
  );

  const actions = useMemo(
    () => ({
      async onLogin({ email, password }) {
        setBusy(true);
        setError("");
        try {
          const next = await login({ email, password });
          setSession(next);
          saveSession(next);
          setView("dashboard");
          await refreshFlows(next);
        } catch (e) {
          setError(e?.message || "Login failed");
        } finally {
          setBusy(false);
        }
      },
      async onLogout() {
        clearSession();
        setSession(null);
        setTemplates([]);
        setFlows([]);
        setView("login");
      },
      async openTemplates() {
        if (!session?.token) return;
        setBusy(true);
        setError("");
        try {
          const data = await listTemplates({ token: session.token });
          setTemplates(Array.isArray(data?.templates) ? data.templates : []);
          setView("templates");
        } catch (e) {
          setError(e?.message || "Failed to load templates");
        } finally {
          setBusy(false);
        }
      },
      async openDashboard() {
        setView("dashboard");
        await refreshFlows(session);
      },
      async startFlow(templateFileId) {
        if (!session?.token) return;
        setBusy(true);
        setError("");
        try {
          await createFlowFromTemplate({ token: session.token, templateFileId });
          await refreshFlows(session);
          setView("dashboard");
        } catch (e) {
          setError(e?.message || "Failed to start flow");
        } finally {
          setBusy(false);
        }
      }
    }),
    [refreshFlows, session]
  );

  if (booting) {
    return (
      <div className="app-shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app-shell">
        <Login busy={busy} error={error} onLogin={actions.onLogin} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      {view === "dashboard" && (
        <Dashboard
          session={session}
          busy={busy}
          error={error}
          flows={flows}
          onLogout={actions.onLogout}
          onOpenTemplates={actions.openTemplates}
          onRefresh={() => refreshFlows(session)}
        />
      )}
      {view === "templates" && (
        <Templates
          session={session}
          busy={busy}
          error={error}
          templates={templates}
          onBack={actions.openDashboard}
          onLogout={actions.onLogout}
          onStartFlow={actions.startFlow}
        />
      )}
    </div>
  );
}

