import crypto from "crypto";

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256Base64Url(input) {
  return crypto.createHash("sha256").update(String(input)).digest("base64url");
}

export function hashToken(token, salt) {
  const s = salt || randomToken(12);
  const hash = sha256Base64Url(`${s}.${token}`);
  return { salt: s, hash };
}

export function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

