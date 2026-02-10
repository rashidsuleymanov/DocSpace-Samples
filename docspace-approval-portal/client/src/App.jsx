import { useEffect, useMemo, useState } from "react";
import AppLayout from "./components/AppLayout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Requests from "./pages/Requests.jsx";
import Projects from "./pages/Projects.jsx";
import Project from "./pages/Project.jsx";
import Login from "./pages/Login.jsx";
import Drafts from "./pages/Drafts.jsx";
import Library from "./pages/Library.jsx";
import Settings from "./pages/Settings.jsx";
import { clearSession, loadSession, saveSession } from "./services/session.js";
import {
  createFlowFromTemplate,
  getProjectsSidebar,
  listDrafts,
  listFlows,
  listTemplates,
  login,
  register
} from "./services/portalApi.js";

function isPdfFile(item) {
  const ext = String(item?.fileExst || "").trim().toLowerCase();
  const title = String(item?.title || "").trim().toLowerCase();
  return ext === "pdf" || ext === ".pdf" || title.endsWith(".pdf");
}

export default function App() {
  const [view, setView] = useState("login");
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState([]);
  const [flows, setFlows] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [activeRoomId, setActiveRoomId] = useState("");
  const [activeProject, setActiveProject] = useState(null);
  const [sidebarProjects, setSidebarProjects] = useState([]);
  const [requestsFilter, setRequestsFilter] = useState("all");
  const [requestsScope, setRequestsScope] = useState("all");
  const [draftsPdfCount, setDraftsPdfCount] = useState(0);
  const [draftsLoaded, setDraftsLoaded] = useState(false);

  useEffect(() => {
    const existing = loadSession();
    if (existing?.token && existing?.user?.id) {
      setSession(existing);
      setView("dashboard");
    }
    setBooting(false);
  }, []);

  const refreshActiveProject = useMemo(
    () => async () => {
      const token = session?.token ? String(session.token) : "";
      if (!token) return;
      const sidebar = await getProjectsSidebar({ token }).catch(() => null);
      const rid = sidebar?.activeRoomId ? String(sidebar.activeRoomId) : "";
      setActiveRoomId(rid);
      const list = Array.isArray(sidebar?.projects) ? sidebar.projects : [];
      setSidebarProjects(list);
      const found = rid ? list.find((p) => String(p.roomId) === rid) || null : null;
      setActiveProject(found ? { id: found.id, title: found.title, roomId: found.roomId, roomUrl: found.roomUrl || null } : null);
    },
    [session?.token]
  );

  const refreshFlows = useMemo(
    () => async (active) => {
      if (!active?.token) return;
      const data = await listFlows({ token: active.token });
      setFlows(Array.isArray(data?.flows) ? data.flows : []);
    },
    []
  );

  const refreshDraftsSummary = useMemo(
    () => async (active) => {
      if (!active?.token) return;
      try {
        const data = await listDrafts({ token: active.token });
        const items = Array.isArray(data?.drafts) ? data.drafts : [];
        setDraftsPdfCount(items.filter(isPdfFile).length);
      } catch {
        setDraftsPdfCount(0);
      } finally {
        setDraftsLoaded(true);
      }
    },
    []
  );

  useEffect(() => {
    if (!session?.token) return;
    refreshActiveProject().catch(() => null);
    const handler = () => refreshActiveProject().catch(() => null);
    const draftsHandler = () => refreshDraftsSummary(session).catch(() => null);
    window.addEventListener("portal:projectChanged", handler);
    window.addEventListener("portal:draftsChanged", draftsHandler);
    return () => {
      window.removeEventListener("portal:projectChanged", handler);
      window.removeEventListener("portal:draftsChanged", draftsHandler);
    };
  }, [refreshActiveProject, refreshDraftsSummary, session]);

  const loadTemplatesForSession = async (activeSession) => {
    if (!activeSession?.token) return [];
    setBusy(true);
    setError("");
    try {
      const data = await listTemplates({ token: activeSession.token });
      const items = Array.isArray(data?.templates) ? data.templates : [];
      setTemplates(items);
      return items;
    } catch (e) {
      setError(e?.message || "Failed to load templates");
      setTemplates([]);
      return [];
    } finally {
      setBusy(false);
    }
  };

  const actions = useMemo(
    () => ({
      navigate(next) {
        setError("");
        if (next === "requests") {
          setRequestsFilter("all");
          setRequestsScope("all");
        }
        setView(next);
      },
      openRequests(filter = "all", scope = "all") {
        setError("");
        setRequestsFilter(String(filter || "all"));
        setRequestsScope(String(scope || "all"));
        setView("requests");
      },
      openProject(id) {
        setError("");
        setProjectId(String(id || "").trim());
        setView("project");
      },
      async onLogin({ email, password }) {
        setBusy(true);
        setError("");
        try {
          const next = await login({ email, password });
          setSession(next);
          saveSession(next);
          setView("dashboard");
          await refreshFlows(next);
          await refreshActiveProject();
          await refreshDraftsSummary(next);
        } catch (e) {
          setError(e?.message || "Login failed");
        } finally {
          setBusy(false);
        }
      },
      async onRegister({ firstName, lastName, email, password }) {
        setBusy(true);
        setError("");
        try {
          const created = await register({ firstName, lastName, email, password });
          if (!created?.token || !created?.user) {
            setError("Account created. Please sign in.");
            setView("login");
            return;
          }
          const next = { token: created.token, user: created.user };
          setSession(next);
          saveSession(next);
          setView("dashboard");
          await refreshFlows(next);
          await refreshActiveProject();
        } catch (e) {
          setError(e?.message || "Registration failed");
        } finally {
          setBusy(false);
        }
      },
      async onLogout() {
        clearSession();
        setSession(null);
        setTemplates([]);
        setFlows([]);
        setActiveRoomId("");
        setActiveProject(null);
        setDraftsPdfCount(0);
        setDraftsLoaded(false);
        setView("login");
      },
      async startFlow(templateFileId) {
        if (!session?.token) return;
        if (!templateFileId) return;
        setBusy(true);
        setError("");
        try {
          await createFlowFromTemplate({ token: session.token, templateFileId });
          await refreshFlows(session);
          window.dispatchEvent(new CustomEvent("portal:projectChanged"));
        } catch (e) {
          setError(e?.message || "Failed to start request");
        } finally {
          setBusy(false);
        }
      }
    }),
    [refreshFlows, session]
  );

  useEffect(() => {
    if (!session?.user?.id) return;
    if ((view === "dashboard" || view === "requests") && flows.length === 0) {
      refreshFlows(session).catch(() => null);
    }
    if ((view === "dashboard" || view === "drafts") && !draftsLoaded) {
      refreshDraftsSummary(session).catch(() => null);
    }
    // Intentionally not depending on flows/templates to avoid over-fetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, view]);

  useEffect(() => {
    if (!session?.token) return;
    // If project changes, invalidate cached forms list for the new room.
    setTemplates([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoomId, session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    if (!String(activeRoomId || "").trim()) return;
    if (view !== "dashboard" && view !== "requests") return;
    if (templates.length > 0) return;
    loadTemplatesForSession(session).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoomId, session?.token, view]);

  if (booting) {
    return (
      <div className="app-shell auth-shell">
        <p className="muted">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app-shell">
        <Login busy={busy} error={error} onLogin={actions.onLogin} onRegister={actions.onRegister} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppLayout
        session={session}
        active={view}
        onNavigate={actions.navigate}
        onLogout={actions.onLogout}
      >
        {view === "dashboard" && (
          <Dashboard
            session={session}
            busy={busy}
            error={error}
            flows={flows}
            activeRoomId={activeRoomId}
            activeProject={activeProject}
            projectsCount={Array.isArray(sidebarProjects) ? sidebarProjects.length : 0}
            projects={Array.isArray(sidebarProjects) ? sidebarProjects : []}
            templates={templates}
            draftsPdfCount={draftsPdfCount}
            onRefresh={async () => {
              await Promise.all([
                refreshFlows(session).catch(() => null),
                refreshActiveProject().catch(() => null),
                refreshDraftsSummary(session).catch(() => null)
              ]);
            }}
            onStartFlow={actions.startFlow}
            onOpenDrafts={() => actions.navigate("drafts")}
            onOpenProjects={() => actions.navigate("projects")}
            onOpenRequests={actions.openRequests}
            onOpenProject={actions.openProject}
          />
        )}
        {view === "requests" && (
          <Requests
            session={session}
            busy={busy}
            error={error}
            flows={flows}
            activeRoomId={activeRoomId}
            activeProject={activeProject}
            projects={Array.isArray(sidebarProjects) ? sidebarProjects : []}
            templates={templates}
            initialFilter={requestsFilter}
            initialScope={requestsScope}
            onBack={() => actions.navigate("dashboard")}
            onStartFlow={actions.startFlow}
            onOpenDrafts={() => actions.navigate("drafts")}
            onOpenProjects={() => actions.navigate("projects")}
          />
        )}
        {view === "projects" && (
          <Projects
            session={session}
            busy={busy}
            onOpenProject={actions.openProject}
            onOpenDrafts={() => actions.navigate("drafts")}
          />
        )}
        {view === "drafts" && (
          <Drafts
            session={session}
            busy={busy}
            onOpenProject={actions.openProject}
            onOpenProjects={() => actions.navigate("projects")}
          />
        )}
        {view === "project" && (
          <Project
            session={session}
            busy={busy}
            projectId={projectId}
            onBack={() => actions.navigate("projects")}
            onStartFlow={actions.startFlow}
            onOpenDrafts={() => actions.navigate("drafts")}
          />
        )}
        {view === "library" && <Library session={session} busy={busy} />}
        {view === "settings" && <Settings session={session} busy={busy} onOpenDrafts={() => actions.navigate("drafts")} />}
      </AppLayout>
    </div>
  );
}
