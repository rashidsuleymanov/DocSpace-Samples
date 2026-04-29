export default function DemoRoleSwitch({ value, onChange }) {
  return (
    <div className="demo-role-toggle-wrap">
      <span className="demo-role-toggle-label">View as</span>
      <div className="demo-role-toggle" aria-label="Demo role switch">
        <div className={`demo-role-toggle-knob${value === "manager" ? " right" : ""}`} aria-hidden="true" />
        <button
          type="button"
          className={`demo-role-toggle-opt ${value === "client" ? "active" : ""}`}
          onClick={() => onChange?.("client")}
        >
          Client
        </button>
        <button
          type="button"
          className={`demo-role-toggle-opt ${value === "manager" ? "active" : ""}`}
          onClick={() => onChange?.("manager")}
        >
          Manager
        </button>
      </div>
    </div>
  );
}
