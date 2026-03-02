import React from "react";
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

export default function StudioLayout() {
  const session = useSession();
  const nav = useNavigate();

  async function logout() {
    await session.logout();
    nav("/studio/login", { replace: true });
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">DS</div>
          <div className="brand-text">
            <div className="brand-title">DocSpace Agents</div>
            <div className="brand-sub">Studio</div>
          </div>
        </div>

        <nav className="nav">
          <NavItem to="/studio" label="Agents" />
          <NavItem to="/studio/templates" label="Templates" />
        </nav>

        <div className="sidebar-footer">
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            Signed in as{" "}
            <span className="chip" style={{ padding: "4px 8px" }}>
              {session?.user?.displayName || session?.user?.email || "User"}
            </span>
          </div>
          <button className="btn secondary" onClick={logout} style={{ marginTop: 8, width: "100%" }}>
            Logout
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
