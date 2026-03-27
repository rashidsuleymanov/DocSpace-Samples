import { randomUUID } from "node:crypto";

const COOKIE_NAME = "dsap_demo_sid";
const sessions = new Map();

function nowMs() {
  return Date.now();
}

function parseCookies(header) {
  const raw = String(header || "");
  if (!raw) return {};
  const out = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function buildCookie({ name, value, maxAgeSeconds, secure } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (typeof maxAgeSeconds === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function createDemoSession({ user, agentId }) {
  const id = randomUUID();
  const session = {
    id,
    createdAt: nowMs(),
    lastSeenAt: nowMs(),
    user,
    agentId: String(agentId || "")
  };
  sessions.set(id, session);
  return session;
}

export function getDemoSessionById(id) {
  return sessions.get(String(id || "")) || null;
}

export function touchDemoSession(session) {
  if (!session) return;
  session.lastSeenAt = nowMs();
}

export function deleteDemoSession(id) {
  return sessions.delete(String(id || ""));
}

export function listDemoSessions() {
  return Array.from(sessions.values());
}

export function isDemoSessionExpired(session, { ttlMs, idleMs } = {}) {
  if (!session) return true;
  const now = nowMs();
  if (ttlMs && now - session.createdAt > ttlMs) return true;
  if (idleMs && now - session.lastSeenAt > idleMs) return true;
  return false;
}

export function getDemoSessionId(req) {
  const cookies = parseCookies(req.headers?.cookie);
  return String(cookies[COOKIE_NAME] || "").trim() || null;
}

export function setDemoSessionCookie(res, sessionId, { ttlMs, isProd } = {}) {
  const maxAgeSeconds = ttlMs ? Math.ceil(ttlMs / 1000) : undefined;
  res.setHeader(
    "Set-Cookie",
    buildCookie({ name: COOKIE_NAME, value: sessionId, maxAgeSeconds, secure: Boolean(isProd) })
  );
}

export function clearDemoSessionCookie(res, { isProd } = {}) {
  res.setHeader(
    "Set-Cookie",
    buildCookie({ name: COOKIE_NAME, value: "", maxAgeSeconds: 0, secure: Boolean(isProd) })
  );
}

export function startDemoJanitor({ ttlMs, idleMs, intervalMs = 60_000, onExpire } = {}) {
  const effectiveInterval = Math.max(10_000, Number(intervalMs) || 60_000);
  const timer = setInterval(async () => {
    const now = nowMs();
    const expired = listDemoSessions().filter((s) => isDemoSessionExpired(s, { ttlMs, idleMs }));
    for (const session of expired) {
      deleteDemoSession(session.id);
      try {
        await onExpire?.(session);
      } catch (e) {
        console.warn("[demo-janitor] onExpire failed", session.id, e?.message || e);
      }
    }
    if (expired.length) {
      console.log(`[demo-janitor] Cleaned up ${expired.length} expired demo session(s).`);
    }
  }, effectiveInterval);
  timer.unref?.();
  return () => clearInterval(timer);
}
