import { useEffect, useMemo, useState } from "react";
import StartDemo from "./pages/StartDemo.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Settings from "./pages/Settings.jsx";
import Appointments from "./pages/Appointments.jsx";
import MedicalRecords from "./pages/MedicalRecords.jsx";
import FillSign from "./pages/FillSign.jsx";
import DoctorPortal from "./pages/DoctorPortal.jsx";
import { endDemo, getDemoSession, startDemo } from "./services/demoApi.js";
import ToastHost from "./components/ToastHost.jsx";
import { toast } from "./utils/toast.js";

const DEMO_IDLE_TIMEOUT_MS = Number(import.meta.env.VITE_DEMO_IDLE_TIMEOUT_MS || 5 * 60 * 1000);
const DEMO_HIDDEN_TIMEOUT_MS = Number(import.meta.env.VITE_DEMO_HIDDEN_TIMEOUT_MS || 30 * 1000);

export default function App() {
  const settingsEnabled = true;
  const [view, setView] = useState("start");
  const [session, setSession] = useState(null);
  const [doctorSession, setDoctorSession] = useState(null);
  const [doctorAccess, setDoctorAccess] = useState(false);
  const [recordsFolderTitle, setRecordsFolderTitle] = useState("");
  const [fillSignInitialTab, setFillSignInitialTab] = useState("");
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState("");

  useEffect(() => {
    const init = async () => {
      try {
        const active = await getDemoSession();
        if (active?.room?.id && active?.patient?.id) {
          const patientName = active.patient.displayName || "Demo Patient";
          const email = active.patient.email || "";
          const initials = patientName
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          setSession({
            user: {
              fullName: patientName,
              email,
              phone: "-",
              initials,
              docspaceId: active.patient.id,
              role: "Patient",
              sex: "",
              birthday: "",
              location: "",
              title: "",
              comment: "",
              token: active?.patientToken || null
            },
            room: {
              id: active.room.id,
              name: active.room.title || `${patientName} - Patient Room`,
              url: active.room.webUrl || ""
            },
            view: "dashboard"
          });
          if (active.doctor?.id) {
            setDoctorSession(active.doctor);
            setDoctorAccess(true);
          } else {
            setDoctorSession(null);
            setDoctorAccess(false);
          }
          setView("dashboard");
        } else {
          setView("start");
        }
      } catch {
        setSession(null);
        setDoctorSession(null);
        setDoctorAccess(false);
        setView("start");
      } finally {
        setBooting(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!session?.room?.id) return;

    let sent = false;
    const endOnPageClose = () => {
      if (sent) return;
      sent = true;
      try {
        const payload = "{}";
        const beaconBlob = new Blob([payload], { type: "application/json" });
        const beaconOk =
          typeof navigator !== "undefined" &&
          typeof navigator.sendBeacon === "function" &&
          navigator.sendBeacon("/api/demo/end", beaconBlob);

        if (!beaconOk) {
          fetch("/api/demo/end", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            keepalive: true,
            body: payload
          }).catch(() => null);
        }
      } catch {
        // ignore close-phase transport errors
      }
    };

    window.addEventListener("pagehide", endOnPageClose);
    window.addEventListener("beforeunload", endOnPageClose);

    return () => {
      window.removeEventListener("pagehide", endOnPageClose);
      window.removeEventListener("beforeunload", endOnPageClose);
    };
  }, [session?.room?.id]);

  useEffect(() => {
    if (!session?.room?.id) return;

    let ended = false;
    let idleTimer = null;
    let hiddenTimer = null;

    const finishDemo = async (reason) => {
      if (ended) return;
      ended = true;
      try {
        await endDemo().catch(() => null);
      } finally {
        setSession(null);
        setDoctorSession(null);
        setDoctorAccess(false);
        setView("start");
        if (reason === "idle") {
          toast.info("Demo ended after inactivity.");
        } else if (reason === "hidden") {
          toast.info("Demo ended after tab was left in background.");
        }
      }
    };

    const clearTimers = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (hiddenTimer) {
        clearTimeout(hiddenTimer);
        hiddenTimer = null;
      }
    };

    const armIdleTimer = () => {
      if (!Number.isFinite(DEMO_IDLE_TIMEOUT_MS) || DEMO_IDLE_TIMEOUT_MS <= 0) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        finishDemo("idle");
      }, DEMO_IDLE_TIMEOUT_MS);
    };

    const armHiddenTimer = () => {
      if (!Number.isFinite(DEMO_HIDDEN_TIMEOUT_MS) || DEMO_HIDDEN_TIMEOUT_MS <= 0) return;
      if (hiddenTimer) clearTimeout(hiddenTimer);
      hiddenTimer = setTimeout(() => {
        finishDemo("hidden");
      }, DEMO_HIDDEN_TIMEOUT_MS);
    };

    const onActivity = () => {
      if (ended) return;
      if (document.visibilityState === "visible") {
        if (hiddenTimer) {
          clearTimeout(hiddenTimer);
          hiddenTimer = null;
        }
        armIdleTimer();
      }
    };

    const onVisibilityChange = () => {
      if (ended) return;
      if (document.visibilityState === "hidden") {
        armHiddenTimer();
      } else {
        if (hiddenTimer) {
          clearTimeout(hiddenTimer);
          hiddenTimer = null;
        }
        armIdleTimer();
      }
    };

    const activityEvents = ["pointerdown", "keydown", "mousemove", "touchstart", "scroll"];
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    armIdleTimer();
    if (document.visibilityState === "hidden") {
      armHiddenTimer();
    }

    return () => {
      clearTimers();
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [session?.room?.id]);

  const actions = useMemo(
    () => ({
      async onStartDemo(payload) {
        setBusy(true);
        setStartError("");
        try {
          const started = await startDemo(payload);
          const patientName = started?.patient?.displayName || "Demo Patient";
          const email = started?.patient?.email || "";
          const initials = patientName
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          setSession({
            user: {
              fullName: patientName,
              email,
              phone: "-",
              initials,
              docspaceId: started.patient.id,
              role: "Patient",
              sex: "",
              birthday: "",
              location: "",
              title: "",
              comment: "",
              token: started?.patientToken || null
            },
            room: {
              id: started.room.id,
              name: started.room.title || `${patientName} - Patient Room`,
              url: started.room.webUrl || ""
            },
            view: "dashboard"
          });

          if (started?.doctor?.id) {
            setDoctorSession(started.doctor);
            setDoctorAccess(true);
          } else {
            setDoctorSession(null);
            setDoctorAccess(false);
          }

          setView("dashboard");
          toast.success("Demo started.");
        } catch (error) {
          const message = error?.message || "Failed to start demo";
          setStartError(message);
          toast.error(message);
        } finally {
          setBusy(false);
        }
      },
      async onLogout() {
        await endDemo().catch(() => null);
        setSession(null);
        setDoctorSession(null);
        setDoctorAccess(false);
        setView("start");
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

  const roleSwitcher =
    session && doctorAccess
      ? {
          activeRole: view === "doctor" ? "doctor" : "patient",
          onSelectPatient: () => setView("dashboard"),
          onSelectDoctor: () => setView("doctor"),
          disabledDoctor: !doctorSession?.id
        }
      : null;

  if (booting) {
    return <div className="app-shell"><p className="muted">Loading session...</p></div>;
  }

  return (
    <div className="app-shell">
      <ToastHost />
      {view === "start" && (
        <StartDemo
          busy={busy}
          error={startError}
          onStart={actions.onStartDemo}
        />
      )}
      {view === "dashboard" && session && (
        <Dashboard
          session={session}
          onLogout={actions.onLogout}
          onNavigate={actions.onNavigate}
          onOpenFolder={actions.onOpenRecordsFolder}
          roleSwitcher={roleSwitcher}
        />
      )}
      {view === "appointments" && session && (
        <Appointments
          session={session}
          onLogout={actions.onLogout}
          onNavigate={actions.onNavigate}
          roleSwitcher={roleSwitcher}
        />
      )}
      {view === "records" && session && (
        <MedicalRecords
          session={session}
          onLogout={actions.onLogout}
          onNavigate={actions.onNavigate}
          roleSwitcher={roleSwitcher}
          initialFolderTitle={recordsFolderTitle}
          onInitialFolderOpened={() => setRecordsFolderTitle("")}
        />
      )}
      {view === "fill-sign" && session && (
        <FillSign
          session={session}
          onLogout={actions.onLogout}
          onNavigate={actions.onNavigate}
          roleSwitcher={roleSwitcher}
          initialTab={fillSignInitialTab}
        />
      )}
      {view === "doctor" && doctorSession && (
        <DoctorPortal
          doctor={doctorSession}
          roleSwitcher={roleSwitcher}
          onExit={() => setView(session ? "dashboard" : "start")}
        />
      )}
      {view === "settings" && settingsEnabled && session && (
        <Settings
          session={session}
          onLogout={actions.onLogout}
          onNavigate={actions.onNavigate}
          roleSwitcher={roleSwitcher}
          onSave={async (payload) => {
            const response = await fetch("/api/patients/update-profile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                userId: session.user.docspaceId,
                roomId: session.room?.id,
                ...payload
              })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(data?.error || `Profile update failed (${response.status})`);
            }
            const user = data?.user || null;
            const fullName =
              [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
              user?.displayName ||
              session.user.fullName;
            const next = {
              ...session,
              user: {
                ...session.user,
                fullName,
                email: user?.email || session.user.email,
                location: user?.location || "",
                title: user?.title || "",
                comment: user?.comment || ""
              }
            };
            setSession(next);
            return next;
          }}
        />
      )}
    </div>
  );
}
