export default function DemoRoleSwitch({ activeRole = "patient", onSelectPatient, onSelectDoctor, disabledDoctor = false }) {
  return (
    <div className="demo-role-switch" role="tablist" aria-label="Demo role">
      <button
        type="button"
        className={`mode-pill ${activeRole === "patient" ? "active" : ""}`}
        onClick={onSelectPatient}
      >
        Patient
      </button>
      <button
        type="button"
        className={`mode-pill ${activeRole === "doctor" ? "active" : ""}`}
        onClick={onSelectDoctor}
        disabled={disabledDoctor}
      >
        Doctor
      </button>
    </div>
  );
}
