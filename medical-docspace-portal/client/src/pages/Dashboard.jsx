import { useEffect, useMemo, useState } from "react";
import PatientShell from "../components/PatientShell.jsx";
import FolderTile from "../components/FolderTile.jsx";
import folderStructure from "../data/folderStructure.js";

const seenNewsStorageKey = "medical.portal.news.seen";

function getSeenNewsKey(session) {
  const userId = session?.user?.docspaceId || "anon";
  const roomId = session?.room?.id || "room";
  return `${seenNewsStorageKey}.${userId}.${roomId}`;
}

function loadSeenNews(session) {
  try {
    const raw = localStorage.getItem(getSeenNewsKey(session));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function saveSeenNews(session, set) {
  try {
    localStorage.setItem(getSeenNewsKey(session), JSON.stringify(Array.from(set)));
  } catch {}
}

export default function Dashboard({ session, onLogout, onNavigate, onOpenFolder }) {
  const [showBanner, setShowBanner] = useState(true);
  const [news, setNews] = useState([]);
  const [newsError, setNewsError] = useState("");

  const [foldersError, setFoldersError] = useState("");
  const [folderStats, setFolderStats] = useState(folderStructure);

  const quickFolderKeys = useMemo(
    () => new Set(["personal-data", "contracts", "insurance", "sick-leave", "imaging", "prescriptions"]),
    []
  );

  useEffect(() => {
    const loadNews = async () => {
      if (!session?.room?.id || session.room.id === "DOCSPACE") return;
      try {
        const headers = session?.user?.token ? { Authorization: session.user.token } : undefined;
        const response = await fetch(`/api/patients/room-news?roomId=${session.room.id}`, {
          headers
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || "Failed to load notifications");
        }
        setNews(data?.folders || []);
        setNewsError("");
      } catch (error) {
        setNewsError(error.message || "Failed to load notifications");
      }
    };
    loadNews();
  }, [session]);

  useEffect(() => {
    const loadFolders = async () => {
      if (!session?.room?.id || session.room.id === "DOCSPACE") return;
      try {
        const headers = session?.user?.token ? { Authorization: session.user.token } : undefined;
        const response = await fetch(`/api/patients/room-summary?roomId=${session.room.id}`, {
          headers
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || "Failed to load folder stats");
        }
        setFolderStats(mapFoldersFromSummary(folderStructure, data.summary || []));
        setFoldersError("");
      } catch (error) {
        setFoldersError(error?.message || "Failed to load folder stats");
      }
    };
    loadFolders();
  }, [session]);

  const notifications = useMemo(() => {
    const seen = loadSeenNews(session);
    const items = [];
    news.forEach((folder) => {
      const entries = Array.isArray(folder?.items) ? folder.items : [];
      const unseen = entries.filter((entry) => entry?.id && !seen.has(`${folder.id}:${entry.id}`));
      if (unseen.length) {
        items.push({
          id: `news-${folder.id}`,
          title: `${unseen.length} new file${unseen.length > 1 ? "s" : ""} in ${folder.title}`,
          detail: "Open documents to review the updates.",
          type: "info",
          action: () => {
            const nextSeen = loadSeenNews(session);
            unseen.forEach((entry) => {
              if (entry?.id) nextSeen.add(`${folder.id}:${entry.id}`);
            });
            saveSeenNews(session, nextSeen);
            const targetTitle = String(folder?.title || "").trim();
            if (targetTitle && typeof onOpenFolder === "function") {
              onOpenFolder(targetTitle);
              return;
            }
            onNavigate("records");
          }
        });
      }
    });
    if (!items.length) {
      items.push({
        id: "news-empty",
        title: "No new documents",
        detail: "New files from the clinic will appear here.",
        type: "muted",
        action: null
      });
    }
    return items;
  }, [news, onNavigate, onOpenFolder, session]);

  return (
    <PatientShell
      user={session.user}
      active="dashboard"
      onNavigate={onNavigate}
      onLogout={onLogout}
      roomId={session?.room?.id}
      token={session?.user?.token}
      banner={
        showBanner ? (
          <section className="notice-banner">
            <strong>Please confirm your email address</strong>
            <span>
              We've sent a confirmation email to <strong>{session.user.email || "your inbox"}</strong>.
            </span>
            <button className="ghost ghost-light" type="button" onClick={() => setShowBanner(false)}>
              Dismiss
            </button>
          </section>
        ) : null
      }
    >
      <section className="panel split-panel">
        <div className="panel-card">
          <h4>Notifications</h4>
          {newsError && <p className="muted">{newsError}</p>}
          <div className="notification-list">
            {notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`notification-item ${item.type}`}
                onClick={item.action || undefined}
                disabled={!item.action}
              >
                <strong>{item.title}</strong>
                <span className="muted">{item.detail}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel-card">
          <h4>Make an appointment</h4>
          <p className="muted">
            Schedule a visit with your doctor at a convenient time. Add the reason to help the
            clinic prepare.
          </p>
          <button className="primary" type="button" onClick={() => onNavigate("appointments")}>
            Book an appointment
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Quick actions</h3>
            <p className="muted">Jump to the most common actions in your account.</p>
          </div>
        </div>
        <div className="quick-actions">
          <button className="secondary" type="button" onClick={() => onNavigate("fill-sign")}>
            Review & sign documents
          </button>
          <button className="ghost ghost-dark" type="button" onClick={() => onNavigate("records")}>
            Open documents
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Your folders</h3>
            <p className="muted">Quick access to key sections in your patient room.</p>
          </div>
        </div>
        {foldersError && <p className="muted">{foldersError}</p>}
        <div className="folder-grid">
          {folderStats
            .filter((folder) => quickFolderKeys.has(folder.key))
            .map((folder) => {
              const { key, ...rest } = folder;
              return (
                <FolderTile
                  key={key}
                  {...rest}
                  onClick={() => {
                    if (typeof onOpenFolder === "function") {
                      onOpenFolder(folder.title);
                      return;
                    }
                    onNavigate("records");
                  }}
                />
              );
            })}
        </div>
      </section>
    </PatientShell>
  );
}

function mapFoldersFromSummary(base, summary) {
  const baseByTitle = new Map(base.map((item) => [normalize(item.title), item]));
  const byKey = new Map();

  for (const folder of summary || []) {
    const count = (folder.filesCount ?? 0) + (folder.foldersCount ?? 0);
    const meta = baseByTitle.get(normalize(folder.title)) || null;
    const key = meta?.key || normalize(folder.title);
    byKey.set(key, {
      key,
      id: folder.id,
      title: folder.title,
      description: meta?.description || "Patient documents",
      icon: meta?.icon || "folder",
      count
    });
  }

  return base.map((item) => byKey.get(item.key) || { ...item, count: 0 });
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

