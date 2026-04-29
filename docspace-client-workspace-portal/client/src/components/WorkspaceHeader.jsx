import DemoRoleSwitch from "./DemoRoleSwitch.jsx";

export default function WorkspaceHeader({
  room,
  user,
  role,
  view,
  onNavigate,
  onRoleChange,
  onEndSession
}) {
  const tabs = role === "manager"
    ? [{ key: "manager", label: "Review Queue" }]
    : [
        { key: "overview", label: "Overview" },
        { key: "projects", label: "Projects" }
      ];

  return (
    <header className="workspace-header">
      <div className="workspace-header__brand">
        <div className="brand-mark" />
        <div>
          <strong>Northstar Client Portal</strong>
          <p className="muted">Workspace: {room?.title || "Provisioning..."}</p>
        </div>
      </div>

      <div className="workspace-header__center">
        <nav className="workspace-tabs" aria-label="Primary navigation">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`workspace-tab ${view === tab.key ? "active" : ""}`}
              onClick={() => onNavigate?.(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="workspace-header__actions">
        <DemoRoleSwitch value={role} onChange={onRoleChange} />
        <div className="workspace-user-chip">
          <span className="avatar">{user?.initials || "CW"}</span>
          <div>
            <strong>{user?.displayName || "Demo user"}</strong>
            <p className="muted">{user?.title || (role === "manager" ? "Manager" : "Client")}</p>
          </div>
        </div>
        <button className="ghost" type="button" onClick={onEndSession}>
          End demo
        </button>
      </div>
    </header>
  );
}
