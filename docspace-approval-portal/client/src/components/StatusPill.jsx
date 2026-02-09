export default function StatusPill({ tone = "gray", children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

