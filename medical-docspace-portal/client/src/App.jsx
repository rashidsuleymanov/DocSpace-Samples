import { useEffect, useMemo, useState } from "react";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Settings from "./pages/Settings.jsx";
import Appointments from "./pages/Appointments.jsx";
import MedicalRecords from "./pages/MedicalRecords.jsx";
import DoctorPortal from "./pages/DoctorPortal.jsx";
import {
  getSession,
  loginUser,
  logoutUser,
  registerPatient,
  updateProfile
} from "./services/docspaceApi.js";
import { getDoctorSession } from "./services/doctorApi.js";

export default function App() {
  const settingsEnabled = false;
  const [view, setView] = useState("login");
  const [session, setSession] = useState(null);
  const [doctorSession, setDoctorSession] = useState(null);
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
          const nextView =
            !settingsEnabled && active?.view === "settings" ? "dashboard" : active?.view;
          setView(nextView || "dashboard");
        }
      } catch {
        setSession(null);
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
          setView("dashboard");
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
        setView("login");
      },
      async onGoDoctor() {
        setBusy(true);
        setAuthError("");
        try {
          const doctor = await getDoctorSession();
          setDoctorSession(doctor);
          setView("doctor");
        } catch (error) {
          setAuthError(error?.message || "Doctor session failed");
        } finally {
          setBusy(false);
        }
      },
      onNavigate(next) {
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
          onGoDoctor={actions.onGoDoctor}
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
      {view === "dashboard" && session && (
        <Dashboard session={session} onLogout={actions.onLogout} onNavigate={actions.onNavigate} />
      )}
      {view === "appointments" && session && (
        <Appointments
          session={session}
          onLogout={actions.onLogout}
          onNavigate={actions.onNavigate}
        />
      )}
      {view === "records" && session && (
        <MedicalRecords
          session={session}
          onLogout={actions.onLogout}
          onNavigate={actions.onNavigate}
        />
      )}
      {view === "doctor" && doctorSession && (
        <DoctorPortal
          doctor={doctorSession}
          onExit={() => {
            setDoctorSession(null);
            setView("login");
          }}
        />
      )}
      {view === "settings" && settingsEnabled && session && (
        <Settings
          session={session}
          onLogout={actions.onLogout}
          onNavigate={actions.onNavigate}
          onSave={async (payload) => {
            const updated = await updateProfile({
              userId: session.user.docspaceId,
              roomId: session.room?.id,
              ...payload
            });
            setSession(updated);
            return updated;
          }}
        />
      )}
    </div>
  );
}
