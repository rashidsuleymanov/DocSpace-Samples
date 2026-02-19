import { useEffect, useMemo, useState } from "react";
import AppLayout from "./components/AppLayout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Documents from "./pages/Documents.jsx";
import Requests from "./pages/Requests.jsx";
import Projects from "./pages/Projects.jsx";
import Project from "./pages/Project.jsx";
import Login from "./pages/Login.jsx";
import Drafts from "./pages/Drafts.jsx";
import Library from "./pages/Library.jsx";
import Contacts from "./pages/Contacts.jsx";
import BulkSend from "./pages/BulkSend.jsx";
import BulkLinks from "./pages/BulkLinks.jsx";
import SendDrafts from "./pages/SendDrafts.jsx";
import Settings from "./pages/Settings.jsx";
import { clearSession, loadSession, saveSession } from "./services/session.js";
import { toast } from "./utils/toast.js";
import {
  createFlowFromTemplate,
  getProjectsSidebar,
  getSettingsConfig,
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

function viewFromHash() {
  const raw = typeof window !== "undefined" ? String(window.location.hash || "") : "";
  const hash = raw.replace(/^#\/?/, "").trim().toLowerCase();
  if (!hash) return "";
  const allowed = new Set([
    "login",
    "dashboard",
    "documents",
    "requests",
    "projects",
    "drafts",
    "bulk",
    "bulklinks",
    "contacts",
    "settings"
  ]);
  if (!allowed.has(hash)) return "";
  return hash === "bulklinks" ? "bulkLinks" : hash;
}

export default function App() {
  const [view, setView] = useState("login");
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasWebhookSecret, setHasWebhookSecret] = useState(false);
  const [branding, setBranding] = useState({
    portalName: "Requests Center",
    portalTagline: "Sign, approve, and track.",
    portalLogoUrl: "",
    portalAccent: ""
  });
  const [templates, setTemplates] = useState([]);
  const [flows, setFlows] = useState([]);
  const [flowsRefreshing, setFlowsRefreshing] = useState(false);
  const [flowsUpdatedAt, setFlowsUpdatedAt] = useState(null);
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
    const initial = viewFromHash();
    if (existing?.token && existing?.user?.id) {
      setSession(existing);
      setView(initial || "dashboard");
    } else if (initial) {
      setView(initial);
    }
    setBooting(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const cfg = await getSettingsConfig().catch(() => null);
      if (!cfg || cancelled) return;
      setHasWebhookSecret(Boolean(cfg.hasWebhookSecret));
      setBranding((prev) => ({
        ...prev,
        portalName: cfg.portalName || prev.portalName,
        portalTagline: cfg.portalTagline || prev.portalTagline,
        portalLogoUrl: cfg.portalLogoUrl || prev.portalLogoUrl,
        portalAccent: cfg.portalAccent || prev.portalAccent
      }));
    };
    run();
    const handler = () => run();
    window.addEventListener("portal:brandingChanged", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("portal:brandingChanged", handler);
    };
  }, []);

  useEffect(() => {
    const name = String(branding?.portalName || "").trim() || "Requests Center";
    if (typeof document !== "undefined") document.title = name;

    const accent = String(branding?.portalAccent || "").trim();
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (!root) return;
    const isHex = /^#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/.test(accent);
    if (!isHex) return;
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accentHover", accent);
    root.style.setProperty("--primary", accent);
    root.style.setProperty("--primaryHover", accent);
  }, [branding?.portalAccent, branding?.portalName]);

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
      setFlowsRefreshing(true);
      try {
        const data = await listFlows({ token: active.token });
        setFlows(Array.isArray(data?.flows) ? data.flows : []);
        setFlowsUpdatedAt(new Date());
      } finally {
        setFlowsRefreshing(false);
      }
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
    const flowsHandler = () => refreshFlows(session).catch(() => null);
    const templatesHandler = () => loadTemplatesForSession(session).catch(() => null);
    window.addEventListener("portal:projectChanged", handler);
    window.addEventListener("portal:draftsChanged", draftsHandler);
    window.addEventListener("portal:flowsChanged", flowsHandler);
    window.addEventListener("portal:templatesChanged", templatesHandler);
    return () => {
      window.removeEventListener("portal:projectChanged", handler);
      window.removeEventListener("portal:draftsChanged", draftsHandler);
      window.removeEventListener("portal:flowsChanged", flowsHandler);
      window.removeEventListener("portal:templatesChanged", templatesHandler);
    };
  }, [refreshActiveProject, refreshDraftsSummary, session]);

  useEffect(() => {
    if (!session?.token) return;
    if (view === "login") return;
    if (hasWebhookSecret) return;

    const hasActive = Array.isArray(flows) && flows.some((f) => String(f?.status || "") === "InProgress");
    if (!hasActive) return;

    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refreshFlows(session).catch(() => null);
      refreshActiveProject().catch(() => null);
    }, 60000);

    return () => clearInterval(id);
  }, [flows, hasWebhookSecret, refreshActiveProject, refreshFlows, session, view]);

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
      openProjects(opts = {}) {
        setError("");
        setView("projects");
        if (opts?.create) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("portal:projectsCreate"));
          }, 0);
        }
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
          setView(viewFromHash() || "dashboard");
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
      async startFlow(templateFileId, projectId, recipientEmails, kind, recipientLevels, dueDate) {
        if (!session?.token) return;
        if (!templateFileId) return;
        setBusy(true);
        setError("");
        try {
          const result = await createFlowFromTemplate({
            token: session.token,
            templateFileId,
            projectId,
            recipientEmails,
            recipientLevels,
            dueDate,
            kind
          });
          await refreshFlows(session);
          window.dispatchEvent(new CustomEvent("portal:flowsChanged"));
          window.dispatchEvent(new CustomEvent("portal:projectChanged"));
          toast("Request created\nOpen Requests to track it.", "success");
          return result;
        } catch (e) {
          setError(e?.message || "Failed to start request");
          return null;
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
    if (view !== "dashboard" && view !== "requests" && view !== "bulk" && view !== "bulkLinks") return;
    if (templates.length > 0) return;
    loadTemplatesForSession(session).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoomId, session?.token, view]);

  useEffect(() => {
    if (!session?.token) return;
    if (view !== "dashboard" && view !== "requests") return;

    const intervalMs = 15000;

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refreshFlows(session).catch(() => null);
    };

    const onVis = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") tick();
    };

    const timer = setInterval(tick, intervalMs);
    window.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      window.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshFlows, session, view]);

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
        {view === "settings" ? (
          <Settings busy={busy} onOpenDrafts={() => actions.navigate("login")} />
        ) : (
          <Login
            branding={branding}
            busy={busy}
            error={error}
            onLogin={actions.onLogin}
            onRegister={actions.onRegister}
            onOpenSettings={() => actions.navigate("settings")}
          />
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppLayout
        session={session}
        branding={branding}
        active={view}
        onNavigate={actions.navigate}
        onOpenProject={actions.openProject}
        onLogout={actions.onLogout}
      >
        {view === "dashboard" && (
          <Dashboard
            session={session}
             busy={busy}
             error={error}
             flows={flows}
             flowsRefreshing={flowsRefreshing}
             flowsUpdatedAt={flowsUpdatedAt}
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
            onOpenProjects={(opts) => actions.openProjects(opts)}
            onOpenRequests={actions.openRequests}
            onOpenProject={actions.openProject}
          />
        )}
        {view === "documents" && (
          <Documents
            session={session}
            busy={busy}
            projects={Array.isArray(sidebarProjects) ? sidebarProjects : []}
            onOpenRequests={() => actions.openRequests("all", "all")}
            onOpenProjects={(opts) => actions.openProjects(opts)}
            onOpenTemplates={() => actions.navigate("drafts")}
          />
        )}
        {view === "requests" && (
          <Requests
            session={session}
             busy={busy}
             error={error}
             flows={flows}
             flowsRefreshing={flowsRefreshing}
             flowsUpdatedAt={flowsUpdatedAt}
             onRefreshFlows={() => refreshFlows(session)}
             activeRoomId={activeRoomId}
             activeProject={activeProject}
             projects={Array.isArray(sidebarProjects) ? sidebarProjects : []}
             templates={templates}
            initialFilter={requestsFilter}
            initialScope={requestsScope}
            onBack={() => actions.navigate("dashboard")}
            onStartFlow={actions.startFlow}
            onOpenDrafts={() => actions.navigate("drafts")}
            onOpenProjects={(opts) => actions.openProjects(opts)}
          />
        )}
        {view === "sendDrafts" && (
          <SendDrafts
            session={session}
            busy={busy}
            onOpenRequests={() => actions.openRequests("all", "all")}
            onOpenBulkSend={() => actions.navigate("bulk")}
            onOpenBulkLinks={() => actions.navigate("bulkLinks")}
          />
        )}
        {view === "bulk" && (
          <BulkSend
            session={session}
            busy={busy}
            activeRoomId={activeRoomId}
            activeProject={activeProject}
            templates={templates}
            onStartFlow={actions.startFlow}
            onOpenRequests={() => actions.openRequests("all", "all")}
          />
        )}
        {view === "bulkLinks" && (
          <BulkLinks
            session={session}
            busy={busy}
            activeRoomId={activeRoomId}
            activeProject={activeProject}
            templates={templates}
            onOpenRequests={() => actions.openRequests("all", "all")}
          />
        )}
        {view === "contacts" && (
          <Contacts
            session={session}
            busy={busy}
            projects={Array.isArray(sidebarProjects) ? sidebarProjects : []}
            activeProject={activeProject}
            onOpenBulk={() => actions.navigate("bulk")}
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
            onOpenProjects={(opts) => actions.openProjects(opts)}
            onOpenSettings={() => actions.navigate("settings")}
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
