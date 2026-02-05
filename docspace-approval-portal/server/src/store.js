import { getStorePath, loadStoreSnapshot, saveStoreSnapshot } from "./storePersistence.js";

const flows = [];

const storePath = getStorePath();
let saveTimer = null;

function snapshotStore() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    flows
  };
}

async function hydrateStore() {
  if (!storePath) return;
  const snapshot = await loadStoreSnapshot(storePath).catch(() => null);
  if (!snapshot) return;
  if (Array.isArray(snapshot.flows)) {
    flows.splice(0, flows.length, ...snapshot.flows);
  }
}

function scheduleSave() {
  if (!storePath) return;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveStoreSnapshot(storePath, snapshotStore()).catch(() => null);
  }, 200);
}

await hydrateStore();

export function createFlow({
  id,
  templateFileId,
  templateTitle,
  createdByUserId,
  createdByName,
  openUrl,
  status = "InProgress"
} = {}) {
  const flowId = String(id || "").trim();
  const fid = String(templateFileId || "").trim();
  const uid = String(createdByUserId || "").trim();
  if (!flowId || !fid || !uid) return null;

  const entry = {
    id: flowId,
    templateFileId: fid,
    templateTitle: templateTitle ? String(templateTitle) : null,
    createdByUserId: uid,
    createdByName: createdByName ? String(createdByName) : null,
    openUrl: openUrl ? String(openUrl) : null,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  flows.unshift(entry);
  scheduleSave();
  return entry;
}

export function listFlowsForUser(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return [];
  return flows
    .filter((flow) => String(flow.createdByUserId || "") === uid)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

