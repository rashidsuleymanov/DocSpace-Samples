const navItems = [
  { id: "dashboard", label: "Overview", icon: "overview" },
  { id: "records", label: "Documents", icon: "documents" },
  { id: "fill-sign", label: "Fill & Sign", icon: "fill" },
  { id: "appointments", label: "Appointments", icon: "appointments" },
  { id: "profile", label: "Profile", icon: "profile", disabled: true }
];

export default function PatientHeader({ user, active, onNavigate, onLogout, badgeCounts }) {
  return (
    <header className="patient-header">
      <div className="patient-brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <strong>City Clinic</strong>
          <span className="muted">Patient portal</span>
        </div>
      </div>
      <nav className="patient-nav">
        {navItems.map((item) => {
          const isActive = active === item.id;
          const badge = item.id === "fill-sign" ? badgeCounts?.fillSign || 0 : 0;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-tab ${isActive ? "active" : ""}`}
              onClick={() => {
                if (!item.disabled) onNavigate?.(item.id);
              }}
              disabled={item.disabled}
            >
              <span className={`nav-icon nav-icon-${item.icon}`} aria-hidden="true" />
              {item.label}
              {badge > 0 && <span className="nav-badge">{badge}</span>}
            </button>
          );
        })}
      </nav>
      <div className="patient-meta">
        <span className="status-pill silver">Silver status</span>
        <div className="avatar avatar-ring">{user?.initials || "PT"}</div>
        <button className="ghost ghost-dark" type="button" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </header>
  );
}
