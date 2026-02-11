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

  for (const flow of flows) {
    if (!flow || typeof flow !== "object") continue;
    if (!flow.groupId && flow.id) flow.groupId = flow.id;
    if (flow.resultFileId === undefined) flow.resultFileId = null;
    if (flow.resultFileTitle === undefined) flow.resultFileTitle = null;
    if (flow.resultFileUrl === undefined) flow.resultFileUrl = null;
  }

  for (const project of projects) {
    if (!project || typeof project !== "object") continue;
    if (!project.signingRoomId) project.signingRoomId = null;
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
  groupId,
  kind = "approval",
  templateFileId,
  templateTitle,
  fileId,
  fileTitle,
  resultFileId,
  resultFileTitle,
  resultFileUrl,
  projectRoomId,
  documentRoomId,
  documentRoomTitle,
  documentRoomUrl,
  createdByUserId,
  recipientEmails,
  recipientUserId,
  recipientName,
  createdByName,
  openUrl,
  linkRequestToken,
  status = "InProgress"
} = {}) {
  const flowId = String(id || "").trim();
  const fid = String(templateFileId || "").trim();
  const uid = String(createdByUserId || "").trim();
  if (!flowId || !fid || !uid) return null;

  const entry = {
    id: flowId,
    groupId: String(groupId || flowId).trim() || flowId,
    kind: String(kind || "approval").trim() || "approval",
    templateFileId: fid,
    templateTitle: templateTitle ? String(templateTitle) : null,
    fileId: fileId ? String(fileId) : null,
    fileTitle: fileTitle ? String(fileTitle) : null,
    resultFileId: resultFileId ? String(resultFileId) : null,
    resultFileTitle: resultFileTitle ? String(resultFileTitle) : null,
    resultFileUrl: resultFileUrl ? String(resultFileUrl) : null,
    projectRoomId: projectRoomId ? String(projectRoomId) : null,
    documentRoomId: documentRoomId ? String(documentRoomId) : null,
    documentRoomTitle: documentRoomTitle ? String(documentRoomTitle) : null,
    documentRoomUrl: documentRoomUrl ? String(documentRoomUrl) : null,
    createdByUserId: uid,
    recipientEmails: Array.isArray(recipientEmails)
      ? Array.from(
          new Set(
            recipientEmails
              .map((e) => String(e || "").trim().toLowerCase())
              .filter(Boolean)
          )
        )
      : [],
    recipientUserId: recipientUserId ? String(recipientUserId) : null,
    recipientName: recipientName ? String(recipientName) : null,
    createdByName: createdByName ? String(createdByName) : null,
    openUrl: openUrl ? String(openUrl) : null,
    linkRequestToken: linkRequestToken ? String(linkRequestToken) : null,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  flows.unshift(entry);
  scheduleSave();
  return entry;
}

export function getFlow(flowId) {
  const id = String(flowId || "").trim();
  if (!id) return null;
  return flows.find((f) => String(f?.id || "") === id) || null;
}

export function updateFlow(flowId, patch = {}) {
  const id = String(flowId || "").trim();
  if (!id) return null;
  const index = flows.findIndex((f) => String(f?.id || "") === id);
  if (index < 0) return null;

  const current = flows[index] || {};
  const next = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };
  flows[index] = next;
  scheduleSave();
  return next;
}

export function cancelFlow(flowId, { canceledByUserId, canceledByName } = {}) {
  const id = String(flowId || "").trim();
  if (!id) return null;
  const current = getFlow(id);
  if (!current) return null;
  if (String(current.status || "") === "Completed") return current;
  if (String(current.status || "") === "Canceled") return current;

  return updateFlow(id, {
    status: "Canceled",
    canceledAt: new Date().toISOString(),
    canceledByUserId: canceledByUserId ? String(canceledByUserId) : null,
    canceledByName: canceledByName ? String(canceledByName) : null
  });
}

export function listFlowsForUser(userId) {
  const uid = typeof userId === "object" && userId !== null ? String(userId.userId || "").trim() : String(userId || "").trim();
  const email =
    typeof userId === "object" && userId !== null && userId.userEmail
      ? String(userId.userEmail || "").trim().toLowerCase()
      : "";
  if (!uid) return [];
  return flows
    .filter((flow) => {
      if (String(flow.createdByUserId || "") === uid) return true;
      if (!email) return false;
      const recipients = Array.isArray(flow?.recipientEmails) ? flow.recipientEmails : [];
      return recipients.map((e) => String(e || "").trim().toLowerCase()).includes(email);
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function listFlowsForRoom(roomId) {
  const rid = String(roomId || "").trim();
  if (!rid) return [];
  return flows
    .filter((flow) => String(flow?.projectRoomId || "").trim() === rid)
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
    signingRoomId: null,
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

export function updateProject(projectId, patch = {}) {
  const pid = String(projectId || "").trim();
  if (!pid) return null;
  const idx = projects.findIndex((p) => String(p?.id || "") === pid);
  if (idx < 0) return null;

  const current = projects[idx] || {};
  const next = {
    ...current,
    ...patch,
    id: current.id,
    roomId: current.roomId,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };
  projects[idx] = next;
  scheduleSave();
  return next;
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
