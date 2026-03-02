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
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
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
