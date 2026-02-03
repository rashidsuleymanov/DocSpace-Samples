import { useEffect, useMemo, useState } from "react";
import PatientHeader from "./PatientHeader.jsx";

function countFiles(node) {
  if (!node) return 0;
  if (node.type === "file") return 1;
  const items = node.items || [];
  return items.reduce((sum, item) => sum + countFiles(item), 0);
}

export default function PatientShell({
  user,
  active,
  onNavigate,
  onLogout,
  badgeCounts,
  roomId,
  token,
  children,
  banner
}) {
  const [fillSignCount, setFillSignCount] = useState(null);

  useEffect(() => {
    const loadCount = async () => {
      if (!token) return;
      try {
        const headers = { Authorization: token };
        const response = await fetch("/api/patients/fill-sign/contents?tab=action", { headers });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "Failed to load Fill & Sign count");
        setFillSignCount(countFiles(data?.contents || null));
      } catch {
        setFillSignCount(null);
      }
    };
    loadCount();
  }, [token]);

  const mergedBadges = useMemo(() => {
    const base = badgeCounts || {};
    if (typeof fillSignCount === "number") {
      return { ...base, fillSign: fillSignCount };
    }
    return base;
  }, [badgeCounts, fillSignCount]);

  return (
    <div className="patient-shell">
      <PatientHeader
        user={user}
        active={active}
        onNavigate={onNavigate}
        onLogout={onLogout}
        badgeCounts={mergedBadges}
      />
      <main className="patient-main">
        {banner}
        {children}
      </main>
    </div>
  );
}
