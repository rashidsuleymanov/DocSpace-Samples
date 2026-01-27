import express from "express";
import dns from "node:dns/promises";
import { Client } from "pg";

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

function normalizeAuthHeader(value) {
  if (!value) return "";
  const v = String(value).trim();
  if (!v) return "";
  if (v.startsWith("Bearer ") || v.startsWith("Basic ") || v.startsWith("ASC ")) return v;
  return `Bearer ${v}`;
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function quoteIdent(value) {
  const v = String(value || "");
  if (!v) throw new Error("Empty identifier");
  return `"${v.replace(/"/g, '""')}"`;
}

function parseTableRef(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("table is required");
  const parts = raw.split(".");
  if (parts.length === 1) return { schema: "public", table: parts[0] };
  return { schema: parts[0] || "public", table: parts.slice(1).join(".") };
}

function sanitizeJdbc(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const hashIndex = trimmed.indexOf("#");
  if (hashIndex < 0) return trimmed;
  return `${trimmed.slice(0, hashIndex)}%23${trimmed.slice(hashIndex + 1)}`;
}

function parseJdbcConnectionString(rawValue) {
  const raw = sanitizeJdbc(rawValue);
  if (!raw) throw new Error("connectionString is empty");

  const withoutJdbc = raw.replace(/^jdbc:/i, "");
  const qIndex = withoutJdbc.indexOf("?");
  const base = qIndex >= 0 ? withoutJdbc.slice(0, qIndex) : withoutJdbc;
  const queryRaw = qIndex >= 0 ? withoutJdbc.slice(qIndex + 1) : "";

  const match = base.match(/^postgresql:\/\/([^/:?#]+)(?::(\d+))?\/([^/?#]+)/i);
  if (!match) throw new Error("Invalid JDBC connection string format");

  const host = match[1];
  const port = match[2] ? Number(match[2]) : 5432;
  const database = match[3];

  const params = new URLSearchParams(queryRaw);
  const user = params.get("user") || undefined;
  const password = params.get("password") || undefined;
  const sslmode = (params.get("sslmode") || "").toLowerCase();
  const ssl = sslmode && sslmode !== "disable" ? { rejectUnauthorized: false } : undefined;

  if (!host || !database || !user) throw new Error("JDBC must include host, database and user");

  return { host, port, database, user, password, ssl };
}

async function resolveIPv4(host) {
  try {
    const ipv4 = await dns.lookup(host, { family: 4 });
    return ipv4?.address;
  } catch {
    return undefined;
  }
}

function withSslServername(ssl, servername) {
  if (!ssl) return ssl;
  return { ...ssl, servername };
}

async function pgClientFromConfig(cfg) {
  const connectionString = cfg?.connectionString;
  const hostaddrOverride = cfg?.hostaddr ? String(cfg.hostaddr).trim() : "";

  if (connectionString) {
    const parsed = parseJdbcConnectionString(connectionString);
    const resolvedHostaddr = hostaddrOverride || (await resolveIPv4(parsed.host));
    const ssl = withSslServername(parsed.ssl, parsed.host);
    const client = new Client({ ...parsed, ssl, hostaddr: resolvedHostaddr || undefined });
    await client.connect();
    return client;
  }

  const host = cfg?.host;
  const port = Number(cfg?.port || 5432);
  const database = cfg?.database;
  const user = cfg?.user;
  const password = cfg?.password;
  const ssl = cfg?.ssl ? { rejectUnauthorized: false } : undefined;

  if (!host || !database || !user) throw new Error("DB host/database/user are required");

  const resolvedHostaddr = hostaddrOverride || (await resolveIPv4(host));
  const sslWithName = withSslServername(ssl, host);
  const client = new Client({ host, hostaddr: resolvedHostaddr || undefined, port, database, user, password, ssl: sslWithName });
  await client.connect();
  return client;
}

async function docspaceRequest(baseUrl, token, pathName, { method = "GET", json, body, headers } = {}) {
  const url = `${normalizeBaseUrl(baseUrl)}${pathName}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: normalizeAuthHeader(token),
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(headers || {})
    },
    body: json ? JSON.stringify(json) : body
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json().catch(() => ({})) : await response.text();

  if (!response.ok) {
    const message = (data && data?.error) || (data && data?.message) || response.statusText;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data?.response ?? data;
}

async function ensureRoomFolderByTitle({ baseUrl, token, roomId, folderTitle }) {
  const content = await docspaceRequest(baseUrl, token, `/api/2.0/files/${roomId}`);
  const folders = content?.folders || [];
  const target = String(folderTitle || "").trim().toLowerCase();
  if (!target) throw new Error("folderTitle is required");

  const existing = folders.find((f) => String(f.title || "").trim().toLowerCase() === target);
  if (existing?.id) return { id: existing.id, title: existing.title };

  const created = await docspaceRequest(baseUrl, token, `/api/2.0/files/folder/${roomId}`, {
    method: "POST",
    json: { title: folderTitle }
  });

  return { id: created?.id, title: created?.title || folderTitle };
}

async function createEmptyFile({ baseUrl, token, folderId, title }) {
  return docspaceRequest(baseUrl, token, `/api/2.0/files/${folderId}/file`, {
    method: "POST",
    json: { title }
  });
}

function extractShareToken(shareLink) {
  if (!shareLink) return null;
  try {
    const url = new URL(shareLink);
    const param = url.searchParams.get("share");
    if (param) return param;
    const parts = url.pathname.split("/").filter(Boolean);
    const sIndex = parts.indexOf("s");
    return sIndex >= 0 && parts[sIndex + 1] ? parts[sIndex + 1] : null;
  } catch {
    return null;
  }
}

async function createFileShareLink({ baseUrl, token, fileId }) {
  try {
    const link = await docspaceRequest(baseUrl, token, `/api/2.0/files/file/${fileId}/link`, {
      method: "PUT",
      json: { access: "ReadWrite" }
    });
    const shareLink = link?.sharedLink?.shareLink || link?.shareLink || null;
    return { shareLink, shareToken: extractShareToken(shareLink) };
  } catch {
    const existing = await docspaceRequest(baseUrl, token, `/api/2.0/files/file/${fileId}/link`).catch(() => null);
    const shareLink = existing?.sharedLink?.shareLink || existing?.shareLink || null;
    return { shareLink, shareToken: extractShareToken(shareLink) };
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "docspace-db-xlsx-plugin-backend", date: new Date().toISOString() });
});

app.post("/api/docspace/self", async (req, res) => {
  try {
    const { baseUrl, token } = req.body || {};
    const self = await docspaceRequest(baseUrl, token, "/api/2.0/people/@self");
    res.json({ ok: true, self });
  } catch (error) {
    console.error("[backend] /api/docspace/self failed", error);
    res.status(500).json({ ok: false, error: error?.message, details: error?.details, status: error?.status });
  }
});

app.post("/api/db/tables", async (req, res) => {
  const { db } = req.body || {};
  let client;
  try {
    client = await pgClientFromConfig(db);
    const result = await client.query(
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name"
    );
    const tables = (result.rows || []).map((r) => ({ schema: r.table_schema, table: r.table_name, ref: `${r.table_schema}.${r.table_name}` }));
    res.json({ ok: true, tables });
  } catch (error) {
    console.error("[backend] /api/db/tables failed", error);
    res.status(500).json({ ok: false, error: error?.message });
  } finally {
    try { await client?.end(); } catch {}
  }
});

app.post("/api/db/rows", async (req, res) => {
  const { db, table, limit } = req.body || {};
  const rowLimit = limit === undefined || limit === null || limit === "" ? 2000 : Number(limit);
  if (!Number.isFinite(rowLimit) || rowLimit <= 0 || rowLimit > 50000) {
    return res.status(400).json({ ok: false, error: "limit must be 1..50000" });
  }

  let client;
  try {
    const { schema, table: tableName } = parseTableRef(table);
    const qualified = `${quoteIdent(schema)}.${quoteIdent(tableName)}`;
    client = await pgClientFromConfig(db);
    const sql = `SELECT * FROM ${qualified} LIMIT ${Math.trunc(rowLimit)}`;
    const result = await client.query(sql);
    res.json({ ok: true, rows: result.rows || [], meta: { table: `${schema}.${tableName}`, limit: rowLimit } });
  } catch (error) {
    console.error("[backend] /api/db/rows failed", error);
    res.status(500).json({ ok: false, error: error?.message });
  } finally {
    try { await client?.end(); } catch {}
  }
});

app.post("/api/docspace/create-xlsx", async (req, res) => {
  const { docspace, fileName } = req.body || {};
  const baseUrl = docspace?.baseUrl;
  const token = docspace?.token;
  const roomId = docspace?.roomId;
  const folderTitle = docspace?.folderTitle || "Reports";

  if (!baseUrl || !token || !roomId) {
    return res.status(400).json({ ok: false, error: "docspace baseUrl/token/roomId are required" });
  }

  try {
    const folder = await ensureRoomFolderByTitle({ baseUrl, token, roomId, folderTitle });
    const safeTitle = String(fileName || "export.xlsx").endsWith(".xlsx") ? String(fileName) : `${fileName || "export"}.xlsx`;
    const file = await createEmptyFile({ baseUrl, token, folderId: folder.id, title: safeTitle });
    const link = await createFileShareLink({ baseUrl, token, fileId: file?.id });

    res.json({
      ok: true,
      folder,
      file: {
        id: file?.id,
        title: file?.title || safeTitle,
        webUrl: file?.webUrl || file?.viewUrl || null,
        shareToken: link?.shareToken || null,
        shareLink: link?.shareLink || null
      }
    });
  } catch (error) {
    console.error("[backend] /api/docspace/create-xlsx failed", error);
    res.status(500).json({ ok: false, error: error?.message, details: error?.details, status: error?.status });
  }
});

const port = Number(process.env.PORT || 5180);
app.listen(port, () => {
  console.log(`[backend] listening on http://localhost:${port}`);
});
