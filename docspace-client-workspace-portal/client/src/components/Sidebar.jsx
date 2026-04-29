export default function Sidebar({ user, onLogout, active = "documents", onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-dot" />
        Client Workspace
      </div>
      <div className="sidebar-user">
        <div className="avatar">{user.initials}</div>
        <div>
          <strong>{user.fullName}</strong>
          <span className="muted">{user.role || "Client"}</span>
        </div>
      </div>
      <nav className="sidebar-nav">
        <button
          className={`nav-item ${active === "documents" ? "active" : ""}`}
          onClick={() => onNavigate?.("documents")}
        >
          Workspace
        </button>
        <button
          className={`nav-item ${active === "applications" ? "active" : ""}`}
          onClick={() => onNavigate?.("applications")}
        >
          Projects
        </button>
      </nav>
      <button className="ghost" type="button" onClick={onLogout}>
        Sign out
      </button>
    </aside>
  );
}
