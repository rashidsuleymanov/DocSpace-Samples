import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function defaultState() {
  return {
    schemaVersion: 1,
    meta: {
      nextChunkId: 1,
      nextAuditId: 1
    },
    adminSessions: [],
    agents: [],
    usage: {},
    kbAllowed: {},
    kbChunks: [],
    publicFiles: [],
    auditLogs: []
  };
}

function atomicWriteJson(filePath, data) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, filePath);
  } catch (err) {
    console.error("[store] Failed to persist state:", err?.message || err);
    try { fs.unlinkSync(tmp); } catch { /* ignore cleanup failure */ }
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function openStore() {
  const filePath = path.resolve(__dirname, "../data/store.json");
  if (!fs.existsSync(path.dirname(filePath))) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  let state = defaultState();
  if (fs.existsSync(filePath)) {
    try {
      state = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      state = defaultState();
    }
  } else {
    atomicWriteJson(filePath, state);
  }

  function save() {
    atomicWriteJson(filePath, state);
  }

  function audit(agentId, event, payload) {
    state.auditLogs.push({
      id: state.meta.nextAuditId++,
      agentId: agentId ? String(agentId) : null,
      event: String(event),
      payload: payload || {},
      createdAt: nowIso()
    });
    // Cap to 1000 entries to prevent unbounded file growth.
    if (state.auditLogs.length > 1000) {
      state.auditLogs = state.auditLogs.slice(-1000);
    }
    save();
  }

  function cleanup() {
    const now = Date.now();
    const before = state.publicFiles.length;
    state.publicFiles = state.publicFiles.filter((f) => Date.parse(f.expiresAt) > now);
    if (state.publicFiles.length !== before) save();
  }

  return {
    get state() {
      return state;
    },
    setState(next) {
      state = next;
      save();
    },
    save,
    audit,
    cleanup
  };
}
