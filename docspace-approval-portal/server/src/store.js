import { getStorePath, loadStoreSnapshot, saveStoreSnapshot } from "./storePersistence.js";

const flows = [];
const projects = [];

const storePath = getStorePath();
let saveTimer = null;

function snapshotStore() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    flows,
    projects
  };
}

async function hydrateStore() {
  if (!storePath) return;
  const snapshot = await loadStoreSnapshot(storePath).catch(() => null);
  if (!snapshot) return;
  if (Array.isArray(snapshot.flows)) {
    flows.splice(0, flows.length, ...snapshot.flows);
  }
  if (Array.isArray(snapshot.projects)) {
    projects.splice(0, projects.length, ...snapshot.projects);
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
  fileId,
  fileTitle,
  projectRoomId,
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
    fileId: fileId ? String(fileId) : null,
    fileTitle: fileTitle ? String(fileTitle) : null,
    projectRoomId: projectRoomId ? String(projectRoomId) : null,
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

export function createProject({ id, title, roomId, roomUrl } = {}) {
  const pid = String(id || "").trim();
  const name = String(title || "").trim();
  const rid = String(roomId || "").trim();
  if (!pid || !name || !rid) return null;

  const entry = {
    id: pid,
    title: name,
    roomId: rid,
    roomUrl: roomUrl ? String(roomUrl) : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  projects.unshift(entry);
  scheduleSave();
  return entry;
}

export function listProjects() {
  return projects
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function getProject(projectId) {
  const pid = String(projectId || "").trim();
  if (!pid) return null;
  return projects.find((p) => String(p.id) === pid) || null;
}

export function deleteProject(projectId) {
  const pid = String(projectId || "").trim();
  if (!pid) return false;
  const idx = projects.findIndex((p) => String(p.id) === pid);
  if (idx === -1) return false;
  projects.splice(idx, 1);
  scheduleSave();
  return true;
}
