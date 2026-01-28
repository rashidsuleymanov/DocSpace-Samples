import { useEffect, useMemo, useState } from "react";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Documents from "./pages/Documents.jsx";
import Applications from "./pages/Applications.jsx";
import OfficerPortal from "./pages/OfficerPortal.jsx";
import {
  getSession,
  loginUser,
  logoutUser,
  registerPatient
} from "./services/docspaceApi.js";
import {
  clearOfficerSessionCache,
  getOfficerSession,
  getOfficerSessionFromCache
} from "./services/officerApi.js";

const viewKey = "docflow.portal.view";

export default function App() {
  const [view, setView] = useState("login");
  const [session, setSession] = useState(null);
  const [officerSession, setOfficerSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState("");

  useEffect(() => {
    const init = async () => {
      try {
        const active = await getSession();
        if (active) {
          setSession(active);
          const cachedView = localStorage.getItem(viewKey);
          setView(cachedView || active?.view || "documents");
        } else {
          const cachedView = localStorage.getItem(viewKey);
          setView(cachedView || "login");
        }
        const cachedOfficer = getOfficerSessionFromCache();
        if (cachedOfficer) {
          setOfficerSession(cachedOfficer);
        }
      } catch {
        setSession(null);
        setView("login");
      } finally {
        setBooting(false);
      }
    };
    init();
  }, []);

  const actions = useMemo(
    () => ({
      async onLogin(credentials) {
        setBusy(true);
        setAuthError("");
        setRegisterSuccess("");
        try {
          const next = await loginUser(credentials);
          setSession(next);
          setView("documents");
        } catch (error) {
          setAuthError(error?.message || "DocSpace login failed");
        } finally {
          setBusy(false);
        }
      },
      async onRegister(payload) {
        setBusy(true);
        setRegisterError("");
        try {
          await registerPatient(payload);
          setRegisterSuccess("Registration complete. Please sign in.");
          setView("login");
        } catch (error) {
          setRegisterError(error?.message || "DocSpace registration failed");
        } finally {
          setBusy(false);
        }
      },
      async onLogout() {
        await logoutUser();
        setSession(null);
        localStorage.setItem(viewKey, "login");
        setView("login");
      },
      async onGoOfficer() {
        setBusy(true);
        setAuthError("");
        try {
          const officer = await getOfficerSession();
          setOfficerSession(officer);
          localStorage.setItem(viewKey, "officer");
          setView("officer");
        } catch (error) {
          setAuthError(error?.message || "Officer session failed");
        } finally {
          setBusy(false);
        }
      },
      onNavigate(next) {
        localStorage.setItem(viewKey, next);
        setView(next);
      }
    }),
    []
  );

  if (booting) {
    return <div className="app-shell"><p className="muted">Loading session...</p></div>;
  }

  return (
    <div className="app-shell">
      {view === "login" && (
        <Login
          busy={busy}
          error={authError}
          success={registerSuccess}
          onLogin={actions.onLogin}
          onGoRegister={() => actions.onNavigate("register")}
          onGoOfficer={actions.onGoOfficer}
        />
      )}
      {view === "register" && (
        <Register
          busy={busy}
          error={registerError}
          onRegister={actions.onRegister}
          onGoLogin={() => actions.onNavigate("login")}
        />
      )}
      {view === "documents" && session && (
        <Documents session={session} onLogout={actions.onLogout} onNavigate={actions.onNavigate} />
      )}
      {view === "applications" && session && (
        <Applications session={session} onLogout={actions.onLogout} onNavigate={actions.onNavigate} />
      )}
      {view === "officer" && officerSession && (
        <OfficerPortal
          officer={officerSession}
          onExit={() => {
            clearOfficerSessionCache();
            setOfficerSession(null);
            localStorage.setItem(viewKey, "login");
            setView("login");
          }}
        />
      )}
    </div>
  );
}
