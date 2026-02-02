import { useEffect, useMemo, useState } from "react";
import PatientShell from "../components/PatientShell.jsx";

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

export default function Dashboard({ session, onLogout, onNavigate }) {
  const [summaryError] = useState("");
  const [showBanner, setShowBanner] = useState(true);
  const [news, setNews] = useState([]);
  const [newsError, setNewsError] = useState("");

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
  }, [news, onNavigate, session]);

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
            <button
              className="ghost ghost-light"
              type="button"
              onClick={() => setShowBanner(false)}
            >
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

      {summaryError && <p className="muted">Summary error: {summaryError}</p>}
    </PatientShell>
  );
}
