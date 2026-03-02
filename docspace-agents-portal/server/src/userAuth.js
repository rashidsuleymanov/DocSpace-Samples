import { sha256Base64Url, randomToken } from "./security.js";
import { nowIso } from "./store.js";
import { loadConfig } from "./config.js";

function parseCookies(header) {
  const raw = String(header || "");
  const out = {};
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v || "");
  }
  return out;
}

function buildSetCookie({ name, value, maxAgeSeconds = 0, httpOnly = true, sameSite = "Lax", secure = false } = {}) {
  const parts = [`${name}=${encodeURIComponent(value || "")}`, "Path=/", `SameSite=${sameSite}`];
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (typeof maxAgeSeconds === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  }
  return parts.join("; ");
}

export function createUserAuth({ store, docspace }) {
  const cfg = loadConfig();
  const cookieName = "dsap_session";
  const ttlSeconds = Number(cfg.sessionTtlSeconds || 60 * 60 * 24 * 7);
  const secure = Boolean(cfg.isProd);

  function issueSession({ token, user }) {
    const sid = `sess_${randomToken(24)}`;
    const sidHash = sha256Base64Url(sid);
    const now = nowIso();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    store.state.userSessions = (store.state.userSessions || []).filter((s) => s.sidHash !== sidHash);
    store.state.userSessions.push({
      sidHash,
      token: String(token || ""),
      user: user || null,
      createdAt: now,
      lastUsedAt: now,
      expiresAt
    });
    store.save();
    return sid;
  }

  function findSessionBySid(sid) {
    const sidHash = sha256Base64Url(String(sid || ""));
    const sessions = store.state.userSessions || [];
    const idx = sessions.findIndex((s) => s.sidHash === sidHash);
    if (idx < 0) return null;
    const entry = sessions[idx];
    const exp = entry?.expiresAt ? Date.parse(entry.expiresAt) : 0;
    if (exp && Date.now() > exp) {
      store.state.userSessions = sessions.filter((s) => s.sidHash !== sidHash);
      store.save();
      return null;
    }
    sessions[idx] = { ...entry, lastUsedAt: nowIso() };
    store.state.userSessions = sessions;
    store.save();
    return sessions[idx];
  }

  function clearSessionCookie(res) {
    res.setHeader(
      "Set-Cookie",
      buildSetCookie({ name: cookieName, value: "", maxAgeSeconds: 0, httpOnly: true, sameSite: "Lax", secure })
    );
  }

  function setSessionCookie(res, sid) {
    res.setHeader(
      "Set-Cookie",
      buildSetCookie({ name: cookieName, value: sid, maxAgeSeconds: ttlSeconds, httpOnly: true, sameSite: "Lax", secure })
    );
  }

  function getSessionFromReq(req) {
    const cookies = parseCookies(req.headers.cookie || "");
    const sid = String(cookies[cookieName] || "").trim();
    if (!sid) return null;
    return findSessionBySid(sid);
  }

  function requireUser(req, res, next) {
    const session = getSessionFromReq(req);
    if (!session?.token || !session?.user?.id) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.user = session.user;
    req.docspaceToken = session.token;
    next();
  }

  async function login({ email, password }) {
    const em = String(email || "").trim();
    const pw = String(password || "");
    if (!em || !pw) {
      const err = new Error("email and password are required");
      err.status = 400;
      throw err;
    }
    const token = await docspace.authenticateUser({ userName: em, password: pw });
    if (!token) {
      const err = new Error("Authentication failed");
      err.status = 401;
      throw err;
    }
    const user = await docspace.getSelfProfileWithToken(token);
    const sid = issueSession({ token, user });
    return { sid, user };
  }

  function logout(req, res) {
    const cookies = parseCookies(req.headers.cookie || "");
    const sid = String(cookies[cookieName] || "").trim();
    if (sid) {
      const sidHash = sha256Base64Url(sid);
      store.state.userSessions = (store.state.userSessions || []).filter((s) => s.sidHash !== sidHash);
      store.save();
    }
    clearSessionCookie(res);
  }

  return {
    cookieName,
    requireUser,
    login,
    logout,
    setSessionCookie,
    clearSessionCookie,
    getSessionFromReq
  };
}
