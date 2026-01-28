import { useEffect, useMemo, useState } from "react";
import PatientHeader from "./PatientHeader.jsx";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

async function fetchFolderContents(folderId, token) {
  const headers = token ? { Authorization: token } : undefined;
  const response = await fetch(`/api/patients/folder-contents?folderId=${folderId}`, {
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load folder contents");
  }
  return data.contents || { items: [] };
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
      if (!roomId || roomId === "DOCSPACE") return;
      try {
        const headers = token ? { Authorization: token } : undefined;
        const response = await fetch(`/api/patients/room-summary?roomId=${roomId}`, { headers });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "Failed to load room summary");
        const summary = data.summary || [];
        const fillFolder = summary.find((item) => normalize(item.title) === "fill & sign");
        if (!fillFolder?.id) {
          setFillSignCount(0);
          return;
        }
        const fillContents = await fetchFolderContents(fillFolder.id, token);
        const subfolders = (fillContents.items || []).filter((item) => item.type === "folder");
        const inProcess = subfolders.find((item) => normalize(item.title) === "in process");
        if (!inProcess?.id) {
          setFillSignCount(0);
          return;
        }
        const inProcessContents = await fetchFolderContents(inProcess.id, token);
        const count = (inProcessContents.items || []).filter((item) => item.type === "file").length;
        setFillSignCount(count);
      } catch {
        setFillSignCount(null);
      }
    };
    loadCount();
  }, [roomId, token]);

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
