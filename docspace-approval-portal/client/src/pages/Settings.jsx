import { useEffect, useState } from "react";
import { getSettingsConfig, testSettingsConfig, updateSettingsConfig } from "../services/portalApi.js";

export default function Settings({ busy, onOpenDrafts }) {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [connLoading, setConnLoading] = useState(false);
  const [clearToken, setClearToken] = useState(false);
  const [conn, setConn] = useState({
    baseUrl: "",
    hasAuthToken: false,
    authTokenMasked: "",
    rawAuthTokenInput: ""
  });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setConnLoading(true);
      setError("");
      setNotice("");
      try {
        const data = await getSettingsConfig();
        if (cancelled) return;
        setConn({
          baseUrl: data?.baseUrl || "",
          hasAuthToken: Boolean(data?.hasAuthToken),
          authTokenMasked: data?.authTokenMasked || "",
          rawAuthTokenInput: ""
        });
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load settings");
      } finally {
        if (!cancelled) setConnLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveConnection = async () => {
    setConnLoading(true);
    setError("");
    setNotice("");
    try {
      const patch = { baseUrl: conn.baseUrl };
      const token = String(conn.rawAuthTokenInput || "").trim();
      if (token) patch.rawAuthToken = token;
      if (!token && clearToken) {
        patch.rawAuthToken = "";
        patch.clearAuthToken = true;
      }

      const data = await updateSettingsConfig(patch);
      setConn((s) => ({
        ...s,
        baseUrl: data?.baseUrl || s.baseUrl,
        hasAuthToken: Boolean(data?.hasAuthToken),
        authTokenMasked: data?.authTokenMasked || "",
        rawAuthTokenInput: ""
      }));
      setClearToken(false);
      setNotice("Saved.");
    } catch (e) {
      setError(e?.message || "Save failed");
    } finally {
      setConnLoading(false);
    }
  };

  const testConnection = async () => {
    setConnLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await testSettingsConfig();
      const label = data?.profile?.email || data?.profile?.displayName || data?.profile?.id || "OK";
      setNotice(`Connection OK (${label}).`);
    } catch (e) {
      setError(e?.message || "Test failed");
    } finally {
      setConnLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Settings</h2>
          <p className="muted">Connect this portal to your DocSpace.</p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <section className="card">
        <div className="card-header">
          <h3>Connection</h3>
          <p className="muted">Saved on the server. The token is never returned to the browser.</p>
        </div>

        <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
          <label>
            <span>DocSpace base URL</span>
            <input
              value={conn.baseUrl}
              onChange={(e) => setConn((s) => ({ ...s, baseUrl: e.target.value }))}
              placeholder="https://your-docspace.example.com"
              disabled={busy || connLoading}
            />
          </label>

          <label>
            <span>Admin token (Authorization)</span>
            <input
              type="password"
              value={conn.rawAuthTokenInput}
              onChange={(e) => setConn((s) => ({ ...s, rawAuthTokenInput: e.target.value }))}
              placeholder={conn.hasAuthToken ? `Saved (${conn.authTokenMasked || "hidden"})` : "Paste token here"}
              disabled={busy || connLoading}
            />
          </label>

          {conn.hasAuthToken ? (
            <label className="inline-check">
              <input
                type="checkbox"
                checked={Boolean(clearToken)}
                onChange={(e) => setClearToken(e.target.checked)}
                disabled={busy || connLoading}
              />
              <span>Clear saved token</span>
            </label>
          ) : null}

          <div className="row-actions">
            <button type="button" onClick={testConnection} disabled={busy || connLoading}>
              Test
            </button>
            <button type="button" className="primary" onClick={saveConnection} disabled={busy || connLoading}>
              {connLoading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="empty">
          <strong>Next</strong>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Go to <strong>Projects</strong> to select a project room, then send forms from the dashboard.
          </p>
          {typeof onOpenDrafts === "function" ? (
            <div className="row-actions" style={{ justifyContent: "flex-start" }}>
              <button type="button" onClick={onOpenDrafts} disabled={busy || connLoading}>
                Open Drafts
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
