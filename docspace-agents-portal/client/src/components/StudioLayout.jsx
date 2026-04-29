import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../services/session.js";

function NavItem({ to, label }) {
  const loc = useLocation();
  const active = loc.pathname === to || (to !== "/studio" && loc.pathname.startsWith(to));
  return (
    <Link to={to} className={`nav-item ${active ? "is-active" : ""}`}>
      {label}
    </Link>
  );
}

function DemoBanner({ session }) {
  const nav = useNavigate();
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    if (!session.demoExpiresAt) return;
    function tick() {
      const diff = new Date(session.demoExpiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Истекло");
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}:${String(s).padStart(2, "0")}`);
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [session.demoExpiresAt]);

  async function handleEnd() {
    await session.endDemo();
    nav("/", { replace: true });
  }

  return (
    <div className="demo-banner">
      <div className="demo-banner-left">
        <span className="demo-badge">Demo</span>
        <span className="demo-banner-name">{session.user?.displayName || "Demo User"}</span>
        {remaining ? <span className="demo-banner-timer">{remaining}</span> : null}
      </div>
      <div className="demo-banner-right">
        {session.demoPublicId ? (
          <a
            href={`/w/${session.demoPublicId}`}
            target="_blank"
            rel="noreferrer"
            className="btn sm secondary"
          >
            Открыть виджет
          </a>
        ) : null}
        <button className="btn sm secondary" onClick={handleEnd}>
          Завершить демо
        </button>
      </div>
    </div>
  );
}

export default function StudioLayout() {
  const session = useSession();
  const nav = useNavigate();

  // Send a beacon when the page is actually unloaded (close/navigate away).
  // Using "pagehide" instead of "visibilitychange" so switching tabs doesn't kill the session.
  useEffect(() => {
    if (!session.isDemo) return;
    function onPageHide() {
      navigator.sendBeacon?.("/api/demo/end");
    }
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [session.isDemo]);

  // Auto-redirect when demo session expires.
  useEffect(() => {
    if (!session.isDemo || !session.demoExpiresAt) return;
    const diff = new Date(session.demoExpiresAt).getTime() - Date.now();
    if (diff <= 0) {
      nav("/", { replace: true });
      return;
    }
    const t = setTimeout(() => nav("/", { replace: true }), diff);
    return () => clearTimeout(t);
  }, [session.isDemo, session.demoExpiresAt, nav]);

  async function logout() {
    await session.logout();
    nav("/studio/login", { replace: true });
  }

  return (
    <div className={`layout ${session.isDemo ? "layout-with-banner" : ""}`}>
      {session.isDemo ? <DemoBanner session={session} /> : null}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div className="brand-text">
            <div className="brand-title">Agents</div>
            <div className="brand-sub">Studio</div>
          </div>
        </div>

        <nav className="nav">
          <NavItem to="/studio" label="Agents" />
          {!session.isDemo ? <NavItem to="/studio/templates" label="Templates" /> : null}
        </nav>

        <div className="sidebar-footer">
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            {session.isDemo ? (
              <span className="demo-badge" style={{ borderRadius: 8, fontSize: "0.82rem" }}>Demo режим</span>
            ) : (
              <>
                Signed in as{" "}
                <span className="chip" style={{ padding: "4px 8px" }}>
                  {session?.user?.displayName || session?.user?.email || "User"}
                </span>
              </>
            )}
          </div>
          {!session.isDemo ? (
            <button className="btn secondary" onClick={logout} style={{ marginTop: 8, width: "100%" }}>
              Sign out
            </button>
          ) : null}
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
