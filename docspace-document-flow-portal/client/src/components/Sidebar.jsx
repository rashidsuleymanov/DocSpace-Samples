export default function Sidebar({ user, onLogout, active = "dashboard", onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-dot" />
        DocFlow
      </div>
      <div className="sidebar-user">
        <div className="avatar">{user.initials}</div>
        <div>
          <strong>{user.fullName}</strong>
          <span className="muted">{user.role || "Citizen"}</span>
        </div>
      </div>
      <nav className="sidebar-nav">
        <button
          className={`nav-item ${active === "documents" ? "active" : ""}`}
          onClick={() => onNavigate?.("documents")}
        >
          My documents
        </button>
        <button
          className={`nav-item ${active === "applications" ? "active" : ""}`}
          onClick={() => onNavigate?.("applications")}
        >
          Applications
        </button>
      </nav>
      <button className="ghost" onClick={onLogout}>
        Sign out
      </button>
    </aside>
  );
}
