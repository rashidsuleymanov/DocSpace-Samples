export default function StatCard({ title, value, meta }) {
  return (
    <div className="stat-card">
      <p className="muted">{title}</p>
      <h3>{value}</h3>
      <span>{meta}</span>
    </div>
  );
}

