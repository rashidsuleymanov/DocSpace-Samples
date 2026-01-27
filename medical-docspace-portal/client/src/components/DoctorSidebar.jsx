const navItems = [
  { id: "doctor-schedule", label: "Schedule" },
  { id: "doctor-patients", label: "Patients" }
];

export default function DoctorSidebar({ doctor, active, onNavigate, onExit, hasPatient }) {
  const initials = (doctor?.displayName || "Doctor")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="sidebar doctor">
      <div className="sidebar-brand">
        <span className="brand-dot" />
        MedRoom Doctor
      </div>
      <div className="sidebar-user">
        <div className="avatar">{initials || "DR"}</div>
        <div>
          <strong>{doctor?.displayName || "Doctor"}</strong>
          <span className="muted">{doctor?.title || "Doctor portal"}</span>
        </div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${active === item.id ? "active" : ""}`}
              type="button"
              onClick={() => onNavigate?.(item.id)}
            >
              {item.label}
            </button>
          ))}
      </nav>
      <button className="ghost" onClick={onExit}>
        Exit doctor mode
      </button>
    </aside>
  );
}
