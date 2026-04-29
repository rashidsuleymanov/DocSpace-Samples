import { useEffect, useMemo, useState } from "react";
import Documents from "./pages/Documents.jsx";
import Applications from "./pages/Applications.jsx";
import OfficerPortal from "./pages/OfficerPortal.jsx";
import StartDemo from "./pages/StartDemo.jsx";
import WorkspaceHeader from "./components/WorkspaceHeader.jsx";
import DocSpaceBackgroundAuth from "./components/DocSpaceBackgroundAuth.jsx";
import { endDemo, getDemoSession, startDemo } from "./services/demoApi.js";

export default function App() {
  const [view, setView] = useState("start");
  const [role, setRole] = useState("client");
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const init = async () => {
      try {
        const active = await getDemoSession();
        if (active) {
          setSession(active);
          setView("overview");
        } else {
          setView("start");
        }
      } catch {
        setSession(null);
        setView("start");
      } finally {
        setBooting(false);
      }
    };
    init();
  }, []);

  const actions = useMemo(
    () => ({
      async onStart(payload) {
        setBusy(true);
        setError("");
        try {
          const next = await startDemo(payload);
          setSession(next);
          setRole("client");
          setView("overview");
        } catch (error) {
          setError(error?.message || "Demo start failed");
        } finally {
          setBusy(false);
        }
      },
      async onEnd() {
        setBusy(true);
        try {
          await endDemo();
        } catch {
          // best-effort cleanup
        } finally {
          setBusy(false);
        }
        setSession(null);
        setRole("client");
        setView("start");
      },
      onNavigate(next) {
        setView(next);
      },
      onRoleChange(nextRole) {
        setRole(nextRole);
        setView(nextRole === "manager" ? "manager" : "overview");
      }
    }),
    []
  );

  if (booting) {
    return <div className="app-shell loading-shell"><p className="muted">Loading workspace...</p></div>;
  }

  const currentRole = role === "manager" ? "manager" : "client";
  const currentActor = currentRole === "manager" ? session?.manager : session?.client;
  const currentCredentialsUrl =
    currentRole === "manager" ? "/api/demo/credentials?role=manager" : "/api/demo/credentials";

  return (
    <div className="app-shell">
      {view === "start" || !session ? (
        <StartDemo busy={busy} error={error} onStart={actions.onStart} />
      ) : (
        <>
          <DocSpaceBackgroundAuth
            sessionUserId={currentActor?.user?.id}
            credentialsUrl={currentCredentialsUrl}
          />
          <div className="workspace-shell">
            <WorkspaceHeader
              room={session.room}
              user={currentActor?.user}
              role={currentRole}
              view={view}
              onNavigate={actions.onNavigate}
              onRoleChange={actions.onRoleChange}
              onEndSession={actions.onEnd}
            />

            {view === "overview" && currentRole === "client" ? (
              <Documents
                session={session}
                actor={currentActor}
                role={currentRole}
                credentialsUrl={currentCredentialsUrl}
                onNavigate={actions.onNavigate}
              />
            ) : null}

            {view === "projects" && currentRole === "client" ? (
              <Applications
                session={session}
                actor={currentActor}
                role={currentRole}
                credentialsUrl={currentCredentialsUrl}
                onNavigate={actions.onNavigate}
              />
            ) : null}

            {view === "manager" && currentRole === "manager" ? (
              <OfficerPortal
                session={session}
                actor={currentActor}
                credentialsUrl={currentCredentialsUrl}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
