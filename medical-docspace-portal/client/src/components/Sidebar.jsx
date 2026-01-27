export default function Sidebar({ user, onLogout, active = "dashboard", onNavigate }) {
  const settingsEnabled = false;
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-dot" />
        MedRoom
      </div>
      <div className="sidebar-user">
        <div className="avatar">{user.initials}</div>
        <div>
          <strong>{user.fullName}</strong>
          <span className="muted">{user.role || "Patient"}</span>
        </div>
      </div>
      <nav className="sidebar-nav">
        <button
          className={`nav-item ${active === "dashboard" ? "active" : ""}`}
          onClick={() => onNavigate?.("dashboard")}
        >
          Dashboard
        </button>
        <button
          className={`nav-item ${active === "records" ? "active" : ""}`}
          onClick={() => onNavigate?.("records")}
        >
          Medical records
        </button>
        <button
          className={`nav-item ${active === "appointments" ? "active" : ""}`}
          onClick={() => onNavigate?.("appointments")}
        >
          Appointments
        </button>
        {settingsEnabled && (
          <button
            className={`nav-item ${active === "settings" ? "active" : ""}`}
            onClick={() => onNavigate?.("settings")}
          >
            Settings
          </button>
        )}
      </nav>
      <button className="ghost" onClick={onLogout}>
        Sign out
      </button>
    </aside>
  );
}
