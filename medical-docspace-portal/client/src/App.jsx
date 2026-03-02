import { useEffect, useMemo, useState } from "react";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Settings from "./pages/Settings.jsx";
import Appointments from "./pages/Appointments.jsx";
import MedicalRecords from "./pages/MedicalRecords.jsx";
import FillSign from "./pages/FillSign.jsx";
import DoctorPortal from "./pages/DoctorPortal.jsx";
import {
  getSession,
  loginUser,
  logoutUser,
  registerPatient,
  updateProfile
} from "./services/docspaceApi.js";
import { getDoctorSession } from "./services/doctorApi.js";
import ToastHost from "./components/ToastHost.jsx";
import { toast } from "./utils/toast.js";

export default function App() {
  const settingsEnabled = true;
  const [view, setView] = useState("login");
  const [session, setSession] = useState(null);
  const [doctorSession, setDoctorSession] = useState(null);
  const [doctorAccess, setDoctorAccess] = useState(false);
  const [recordsFolderTitle, setRecordsFolderTitle] = useState("");
  const [fillSignInitialTab, setFillSignInitialTab] = useState("");
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
          try {
            const doctor = await getDoctorSession();
            if (doctor?.email) {
              setDoctorSession(doctor);
              setDoctorAccess(true);
            }
          } catch {
            setDoctorSession(null);
            setDoctorAccess(false);
          }
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

          const role = String(credentials?.role || "patient").toLowerCase();
          if (role === "doctor") {
            try {
              const doctor = await getDoctorSession();
              setDoctorSession(doctor);
              setDoctorAccess(true);
              setView("doctor");
              toast.success("Signed in as doctor.");
            } catch (error) {
              await logoutUser();
              setSession(null);
              setDoctorSession(null);
              setDoctorAccess(false);
              const message = error?.message || "Doctor sign-in failed";
              setAuthError(message);
              toast.error(message);
              setView("login");
            }
            return;
          }

          setView("dashboard");
          toast.success("Signed in.");
          // Background check: if the same account also has doctor access, enable the switch.
          try {
            const doctor = await getDoctorSession();
            if (doctor?.email) {
              setDoctorSession(doctor);
              setDoctorAccess(true);
            } else {
              setDoctorSession(null);
              setDoctorAccess(false);
            }
          } catch {
            setDoctorSession(null);
            setDoctorAccess(false);
          }
        } catch (error) {
          const message = error?.message || "Sign-in failed";
          setAuthError(message);
          toast.error(message);
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
          toast.success("Registration complete. Please sign in.");
        } catch (error) {
          const message = error?.message || "Registration failed";
          setRegisterError(message);
          toast.error(message);
        } finally {
          setBusy(false);
        }
      },
      async onLogout() {
        await logoutUser();
        setSession(null);
        setDoctorSession(null);
        setDoctorAccess(false);
        setView("login");
      },
      async onGoDoctorPortal() {
        setBusy(true);
        setAuthError("");
        try {
          const doctor = await getDoctorSession();
          setDoctorSession(doctor);
          setDoctorAccess(true);
          setView("doctor");
        } catch (error) {
          const message = error?.message || "Doctor session failed";
          setAuthError(message);
          toast.error(message);
        } finally {
          setBusy(false);
        }
      },
      onNavigate(next) {
        if (typeof next === "string") {
          if (next === "fill-sign") setFillSignInitialTab("");
          setView(next);
          return;
        }
        if (!next || typeof next !== "object") return;
        const nextView = String(next.view || "").trim();
        if (!nextView) return;
        if (nextView === "fill-sign") {
          setFillSignInitialTab(String(next.tab || "").trim());
        }
        setView(nextView);
      },
      onOpenRecordsFolder(folderTitle) {
        setRecordsFolderTitle(String(folderTitle || "").trim());
        setView("records");
      }
    }),
    []
  );

  if (booting) {
    return <div className="app-shell"><p className="muted">Loading session...</p></div>;
  }

  return (
    <div className="app-shell">
      <ToastHost />
      {view === "login" && (
        <Login
          busy={busy}
          error={authError}
          success={registerSuccess}
          onLogin={actions.onLogin}
          onGoRegister={() => actions.onNavigate("register")}
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
        <Dashboard
          session={session}
          onLogout={actions.onLogout}
          onNavigate={actions.onNavigate}
          onOpenFolder={actions.onOpenRecordsFolder}
          doctorAccess={doctorAccess}
          onGoDoctorPortal={actions.onGoDoctorPortal}
        />
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
          initialFolderTitle={recordsFolderTitle}
          onInitialFolderOpened={() => setRecordsFolderTitle("")}
        />
      )}
      {view === "fill-sign" && session && (
        <FillSign
          session={session}
          onLogout={actions.onLogout}
          onNavigate={actions.onNavigate}
          initialTab={fillSignInitialTab}
        />
      )}
      {view === "doctor" && doctorSession && (
        <DoctorPortal
          doctor={doctorSession}
          onExit={() => {
            setDoctorSession(null);
            setView(session ? "dashboard" : "login");
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
