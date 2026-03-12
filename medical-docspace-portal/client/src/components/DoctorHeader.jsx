import DemoRoleSwitch from "./DemoRoleSwitch.jsx";

const navItems = [
  { id: "doctor-schedule", label: "Schedule", icon: "appointments" },
  { id: "doctor-patients", label: "Patients", icon: "documents" },
  { id: "doctor-inbox", label: "Incoming", icon: "documents" },
  { id: "doctor-fill-sign", label: "Fill & Sign", icon: "fill" }
];

export default function DoctorHeader({ doctor, active, onNavigate, onExit, roleSwitcher }) {
  const initials = (doctor?.displayName || "Doctor")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="patient-header doctor-header">
      <div className="patient-brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <strong>City Clinic</strong>
          <span className="muted">Doctor portal</span>
        </div>
      </div>
      <nav className="patient-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-tab ${active === item.id ? "active" : ""}`}
            onClick={() => onNavigate?.(item.id)}
          >
            <span className={`nav-icon nav-icon-${item.icon}`} aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="patient-meta">
        {roleSwitcher ? (
          <DemoRoleSwitch
            activeRole={roleSwitcher.activeRole}
            onSelectPatient={roleSwitcher.onSelectPatient}
            onSelectDoctor={roleSwitcher.onSelectDoctor}
            disabledDoctor={roleSwitcher.disabledDoctor}
          />
        ) : null}
        <div className="avatar avatar-ring">{initials || "DR"}</div>
        <button className="ghost ghost-dark" type="button" onClick={onExit}>
          Exit doctor mode
        </button>
      </div>
    </header>
  );
}
