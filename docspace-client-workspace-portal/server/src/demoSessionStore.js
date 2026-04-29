import { randomUUID } from "node:crypto";

const COOKIE_NAME = process.env.DEMO_COOKIE_NAME || "demo_sid";
const sessions = new Map();

function parseCookies(header) {
  const raw = String(header || "");
  if (!raw) return {};
  return raw.split(";").reduce((acc, part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});
}

function buildCookie({ name, value, maxAgeSeconds, secure } = {}) {
  const parts = [`${name}=${encodeURIComponent(value || "")}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (typeof maxAgeSeconds === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  }
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function getDemoSessionId(req) {
  const cookies = parseCookies(req.headers?.cookie);
  const sessionId = String(cookies[COOKIE_NAME] || "").trim();
  return sessionId || null;
}

export function getDemoSessionById(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return null;
  return sessions.get(id) || null;
}

export function createDemoSession(initial = {}) {
  const id = randomUUID();
  const now = Date.now();
  const session = {
    id,
    createdAt: now,
    lastSeenAt: now,
    ...initial
  };
  sessions.set(id, session);
  return session;
}

export function touchDemoSession(session) {
  if (!session) return;
  session.lastSeenAt = Date.now();
}

export function deleteDemoSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return false;
  return sessions.delete(id);
}

export function setDemoSessionCookie(res, sessionId) {
  const secure = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    buildCookie({
      name: COOKIE_NAME,
      value: sessionId,
      maxAgeSeconds: 60 * 60,
      secure
    })
  );
}

export function clearDemoSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    buildCookie({
      name: COOKIE_NAME,
      value: "",
      maxAgeSeconds: 0,
      secure
    })
  );
}
