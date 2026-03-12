export default function DoctorTopbar({
  title,
  subtitle,
  dateFilter,
  onDateFilter
}) {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  const today = new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);

  return (
    <header className="topbar doctor-topbar">
      <div>
        <h2>{title || "Doctor workspace"}</h2>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      <div className="doctor-topbar-actions">
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
      </div>
    </header>
  );
}
