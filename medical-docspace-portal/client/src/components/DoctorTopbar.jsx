export default function DoctorTopbar({ title, subtitle, dateFilter, onDateFilter }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <header className="topbar doctor-topbar">
      <div>
        <h2>{title || "Doctor workspace"}</h2>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {typeof onDateFilter === "function" && (
        <label className="date-filter">
          <span className="muted">Schedule date</span>
          <input
            type="date"
            lang="en-US"
            value={dateFilter || today}
            onChange={(e) => onDateFilter(e.target.value)}
          />
        </label>
      )}
    </header>
  );
}
