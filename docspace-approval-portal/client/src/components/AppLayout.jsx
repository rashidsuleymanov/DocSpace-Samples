import { useEffect, useMemo, useState } from "react";
import { activateProject, getProjectsSidebar } from "../services/portalApi.js";
import ToastHost from "./ToastHost.jsx";

function initialsFrom(value) {
  const text = String(value || "").trim();
  if (!text) return "U";
  const parts = text.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "U";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

const navSections = [
  {
    title: "Workspace",
    items: [
      { id: "dashboard", label: "Home" },
      { id: "requests", label: "Requests" },
      { id: "drafts", label: "Templates" },
      { id: "documents", label: "Results" },
      { id: "contacts", label: "Contacts" }
    ]
  },
  {
    title: "System",
    items: [{ id: "settings", label: "Settings" }]
  }
];

export default function AppLayout({ session, branding, active, onNavigate, onOpenProject, onLogout, children }) {
  const displayName = session?.user?.displayName || session?.user?.email || "User";
  const token = session?.token || "";
  const projectsActive = active === "projects" || active === "project";

  const portalName = String(branding?.portalName || "Requests Center").trim() || "Requests Center";
  const portalTagline = String(branding?.portalTagline || "Sign, approve, and track.").trim() || "Sign, approve, and track.";
  const portalLogoUrl = String(branding?.portalLogoUrl || "").trim();
  const brandMark = initialsFrom(portalName.replace(/portal$/i, "").trim() || portalName);

  const [projectsOpen, setProjectsOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(() => {
    try {
      return window.localStorage.getItem("portal:toolsOpen") === "1";
    } catch {
      return false;
    }
  });
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState("");
  const [projects, setProjects] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [projectsQuery, setProjectsQuery] = useState("");

  useEffect(() => {
    try {
      window.localStorage.setItem("portal:toolsOpen", toolsOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }, [toolsOpen]);

  const currentProject = useMemo(() => {
    const rid = String(activeRoomId || "").trim();
    if (!rid) return null;
    return projects.find((p) => String(p.roomId) === rid) || null;
  }, [activeRoomId, projects]);

  const currentProjectTitle = String(currentProject?.title || "").trim();
  const currentProjectLabel = currentProjectTitle || "No project selected";

  const filteredProjects = useMemo(() => {
    const q = String(projectsQuery || "").trim().toLowerCase();
    const list = Array.isArray(projects) ? projects : [];
    const items = q ? list.filter((p) => String(p?.title || "").toLowerCase().includes(q)) : list.slice();

    items.sort((a, b) => {
      const aCur = Boolean(activeRoomId) && String(a?.roomId || "") === String(activeRoomId);
      const bCur = Boolean(activeRoomId) && String(b?.roomId || "") === String(activeRoomId);
      if (aCur !== bCur) return aCur ? -1 : 1;
      return String(a?.title || "").localeCompare(String(b?.title || ""));
    });

    return items;
  }, [activeRoomId, projects, projectsQuery]);

  const refreshSidebar = async () => {
    if (!token) return;
    setProjectsLoading(true);
    setProjectsError("");
    try {
      const data = await getProjectsSidebar({ token });
      setActiveRoomId(String(data?.activeRoomId || "").trim());
      setProjects(Array.isArray(data?.projects) ? data.projects : []);
    } catch (e) {
      setProjectsError(e?.message || "Failed to load projects");
      setProjects([]);
      setActiveRoomId("");
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    refreshSidebar().catch(() => null);
    const handler = () => refreshSidebar().catch(() => null);
    window.addEventListener("portal:projectChanged", handler);
    return () => window.removeEventListener("portal:projectChanged", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPickProject = async (project) => {
    if (!project?.id) return;
    setProjectsLoading(true);
    setProjectsError("");
    try {
      const result = await activateProject(project.id);
      const nextActive = String(result?.activeRoomId || project.roomId || "").trim();
      setActiveRoomId(nextActive);
      window.dispatchEvent(new CustomEvent("portal:projectChanged"));
    } catch (e) {
      setProjectsError(e?.message || "Failed to set current project");
    } finally {
      setProjectsLoading(false);
    }
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <button type="button" className="brand" onClick={() => onNavigate("dashboard")}>
          <div className="brand-mark" aria-hidden="true">
            {portalLogoUrl ? <img src={portalLogoUrl} alt="" /> : brandMark}
          </div>
          <div className="brand-text">
            <strong>{portalName}</strong>
            <span className="muted">{portalTagline}</span>
          </div>
        </button>

        <section className="projects-nav" aria-label="Project switcher">
          <div className="projects-nav-head">
            <button
              type="button"
              className={`nav-item projects-nav-link${projectsActive ? " is-active" : ""}`}
              onClick={() => onNavigate("projects")}
            >
              <span>Current project</span>
              <span className="muted truncate projects-nav-current">{currentProjectLabel}</span>
            </button>
            <button
              type="button"
              className="projects-nav-expand"
              onClick={() => setProjectsOpen((s) => !s)}
              aria-label={projectsOpen ? "Collapse project list" : "Expand project list"}
              title={projectsOpen ? "Collapse" : "Expand"}
            >
              <svg
                className={`chevron${projectsOpen ? " is-open" : ""}`}
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d="M6 8L10 12L14 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {projectsOpen ? (
            <div className="projects-nav-list">
              {projectsError ? <div className="projects-nav-error">{projectsError}</div> : null}
              {projects.length ? (
                <input
                  className="projects-nav-search"
                  value={projectsQuery}
                  onChange={(e) => setProjectsQuery(e.target.value)}
                  placeholder="Search projects..."
                  disabled={projectsLoading}
                />
              ) : null}
              {!projectsLoading && projects.length === 0 ? (
                <button type="button" className="projects-nav-item" onClick={() => onNavigate("projects")}>
                  <span className="projects-nav-title truncate">Create your first project</span>
                  <span className="projects-nav-meta muted">Publish templates, then start requests.</span>
                  <span className="projects-nav-right" aria-hidden="true">
                    +
                  </span>
                </button>
              ) : null}
              {filteredProjects.map((p) => {
                const isCurrent = Boolean(activeRoomId) && String(p.roomId) === String(activeRoomId);
                const inProgress = Number(p?.counts?.inProgress || 0);
                const total = Number(p?.counts?.total || 0);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`projects-nav-item${isCurrent ? " is-current" : ""}`}
                    onClick={() => {
                      if (typeof onOpenProject === "function" && p?.id) {
                        onOpenProject(p.id);
                        return;
                      }
                      onPickProject(p);
                    }}
                    disabled={projectsLoading}
                    title={p?.title ? `Open ${p.title}` : "Open project"}
                  >
                    <span className="projects-nav-title truncate">{p.title || "Untitled"}</span>
                    <span className="projects-nav-meta muted">
                      {inProgress ? `${inProgress} in progress` : "No active requests"}
                      {total ? ` - ${total} total` : ""}
                    </span>
                    <span className="projects-nav-right" aria-hidden="true">
                      {isCurrent ? "Current" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        <nav className="nav" aria-label="Primary navigation">
          {navSections.map((section) => (
            <div key={section.title} className="nav-section">
              <div className="nav-section-title" aria-hidden="true">
                {section.title}
              </div>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item${active === item.id ? " is-active" : ""}`}
                  onClick={() => onNavigate(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}

          <div className="nav-section">
            <div className="nav-section-title">
              <button type="button" className="nav-section-toggle" onClick={() => setToolsOpen((s) => !s)} aria-expanded={toolsOpen}>
                <span>Tools</span>
                <span className={`nav-section-chev${toolsOpen ? " is-open" : ""}`} aria-hidden="true">
                  ▾
                </span>
              </button>
            </div>
            {toolsOpen ? (
              <>
                {[
                  { id: "sendDrafts", label: "Request drafts" },
                  { id: "bulk", label: "Bulk send" },
                  { id: "bulkLinks", label: "Bulk links" }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`nav-item${active === item.id ? " is-active" : ""}`}
                    onClick={() => onNavigate(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </>
            ) : null}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user">
            <div className="avatar" aria-hidden="true">
              {initialsFrom(displayName)}
            </div>
            <div className="user-meta">
              <strong className="truncate">{displayName}</strong>
              <span className="muted truncate">{session?.user?.email || session?.user?.userName || ""}</span>
            </div>
          </div>
          <button type="button" className="nav-item subtle" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content">{children}</main>
      <ToastHost />
    </div>
  );
}
