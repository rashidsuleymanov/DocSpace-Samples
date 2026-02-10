import { useEffect, useMemo, useState } from "react";
import { activateProject, getProjectsSidebar } from "../services/portalApi.js";

function initialsFrom(value) {
  const text = String(value || "").trim();
  if (!text) return "U";
  const parts = text.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "U";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

const navItems = [
  { id: "dashboard", label: "Home" },
  { id: "requests", label: "Requests" },
  { id: "drafts", label: "Templates" },
  { id: "settings", label: "Settings" }
];

export default function AppLayout({ session, active, onNavigate, onLogout, children }) {
  const displayName = session?.user?.displayName || session?.user?.email || "User";
  const token = session?.token || "";
  const projectsActive = active === "projects" || active === "project";

  const [projectsOpen, setProjectsOpen] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState("");
  const [projects, setProjects] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState("");

  const currentProject = useMemo(() => {
    const rid = String(activeRoomId || "").trim();
    if (!rid) return null;
    return projects.find((p) => String(p.roomId) === rid) || null;
  }, [activeRoomId, projects]);

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
            DS
          </div>
          <div className="brand-text">
            <strong>DocSpace</strong>
            <span className="muted">Approval portal</span>
          </div>
        </button>

        <section className="projects-nav" aria-label="Projects">
          <div className="projects-nav-head">
            <button
              type="button"
              className={`nav-item projects-nav-link${projectsActive ? " is-active" : ""}`}
              onClick={() => onNavigate("projects")}
            >
              <span>Projects</span>
              <span className="muted truncate projects-nav-current">{currentProject?.title || ""}</span>
            </button>
            <button
              type="button"
              className="projects-nav-expand"
              onClick={() => setProjectsOpen((s) => !s)}
              aria-label={projectsOpen ? "Collapse project list" : "Expand project list"}
              title={projectsOpen ? "Collapse" : "Expand"}
            >
              {projectsOpen ? "▾" : "▸"}
            </button>
          </div>

          {projectsOpen ? (
            <div className="projects-nav-list">
              {projectsError ? <div className="projects-nav-error">{projectsError}</div> : null}
              {!projectsLoading && projects.length === 0 ? (
                <button type="button" className="projects-nav-item" onClick={() => onNavigate("projects")}>
                  <span className="truncate">Create your first project</span>
                  <span className="badge badge-blue">+</span>
                </button>
              ) : null}
              {projects.map((p) => {
                const isCurrent = Boolean(activeRoomId) && String(p.roomId) === String(activeRoomId);
                const inProgress = Number(p?.counts?.inProgress || 0);
                const total = Number(p?.counts?.total || 0);
                const counterLabel = total ? `${inProgress}/${total}` : "0";
                const counterTitle = total
                  ? `${inProgress} in progress • ${total} total`
                  : "No requests yet";
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`projects-nav-item${isCurrent ? " is-current" : ""}`}
                    onClick={() => onPickProject(p)}
                    disabled={projectsLoading}
                    title={isCurrent ? "Current project" : "Set as current project"}
                  >
                    <span className="truncate">{p.title || "Untitled"}</span>
                    <span className="projects-nav-badges">
                      <span
                        className={`badge${inProgress ? " badge-blue" : " badge-muted"}`}
                        title={counterTitle}
                      >
                        {counterLabel}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item${active === item.id ? " is-active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
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
    </div>
  );
}
