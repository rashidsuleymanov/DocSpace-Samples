import { config } from "./config.js";

const baseUrl = config.baseUrl;
const adminAuthHeader = config.rawAuthToken ? normalizeAuthHeader(config.rawAuthToken) : "";

function normalizeAuthHeader(value) {
  if (!value) return "";
  if (value.startsWith("Bearer ") || value.startsWith("Basic ") || value.startsWith("ASC ")) {
    return value;
  }
  return `Bearer ${value}`;
}

function requireConfig({ requiresAuth = true } = {}) {
  if (!baseUrl) {
    throw new Error("DOCSPACE_BASE_URL is not set");
  }
  if (requiresAuth && !adminAuthHeader) {
    throw new Error("DOCSPACE_AUTH_TOKEN is not set");
  }
}

async function apiRequest(path, { method = "GET", body, auth } = {}) {
  requireConfig({ requiresAuth: !auth });
  const authorization = normalizeAuthHeader(auth || adminAuthHeader);
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || data?.message || response.statusText;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data?.response ?? data;
}

export async function authenticateUser({ userName, password }) {
  requireConfig({ requiresAuth: false });
  const response = await fetch(`${baseUrl}/api/2.0/authentication`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userName, password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || data?.message || response.statusText;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data?.response?.token || null;
}

export async function getSelfProfileWithToken(token) {
  if (!token) throw new Error("User token is required");
  return apiRequest("/api/2.0/people/@self", { auth: token });
}

export async function getAdminProfile() {
  return apiRequest("/api/2.0/people/@self");
}

export async function getTokenClaims() {
  return apiRequest("/api/2.0/people/tokendiagnostics");
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export async function listRooms(auth) {
  const roomsFolder = await apiRequest("/api/2.0/files/rooms", { auth });
  return roomsFolder?.folders || [];
}

export async function findRoomByCandidates(candidates, auth) {
  const list = await listRooms(auth);
  const normalized = (candidates || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => ({ key: normalize(value) }));
  if (!normalized.length) return null;
  const rooms = (list || []).map((r) => ({ ...r, key: normalize(r.title || r.name) }));
  for (const candidate of normalized) {
    const match = rooms.find((r) => r.key === candidate.key);
    if (match) return match;
  }
  for (const candidate of normalized) {
    const match = rooms.find((r) => r.key.includes(candidate.key));
    if (match) return match;
  }
  return null;
}

export async function requireFormsRoom(auth) {
  const candidates = [config.formsRoomTitle, ...(config.formsRoomTitleFallbacks || [])]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const room = await findRoomByCandidates(candidates, auth);
  if (!room?.id) {
    throw new Error(
      `Forms room not found. Configure DOCSPACE_FORMS_ROOM_TITLE (candidates: ${candidates.join(", ") || "Forms Room"}).`
    );
  }
  return room;
}

export async function getFolderContents(folderId, auth) {
  const id = String(folderId || "").trim();
  if (!id) throw new Error("folderId is required");
  return apiRequest(`/api/2.0/files/folder/${encodeURIComponent(id)}`, { auth });
}

async function getFolderByTitleWithin(folderId, title, auth) {
  const contents = await getFolderContents(folderId, auth);
  const items = Array.isArray(contents?.items) ? contents.items : [];
  const target = normalize(title);
  const exact = items.find((i) => i.type === "folder" && normalize(i.title) === target);
  const match = exact || items.find((i) => i.type === "folder" && normalize(i.title).includes(target));
  return match || null;
}

export async function getFormsRoomFolders(roomId, auth) {
  const rid = String(roomId || "").trim();
  if (!rid) throw new Error("roomId is required");

  const [inProcess, complete, templates] = await Promise.all([
    getFolderByTitleWithin(rid, "In Process", auth).catch(() => null),
    getFolderByTitleWithin(rid, "Complete", auth).catch(() => null),
    config.formsTemplatesFolderTitle
      ? getFolderByTitleWithin(rid, config.formsTemplatesFolderTitle, auth).catch(() => null)
      : Promise.resolve(null)
  ]);

  if (!inProcess?.id) throw new Error("Forms room folder not found: In Process");
  if (!complete?.id) throw new Error("Forms room folder not found: Complete");

  return {
    inProcess,
    complete,
    templates: templates?.id ? templates : null
  };
}

export async function getFileInfo(fileId, auth) {
  const id = String(fileId || "").trim();
  if (!id) throw new Error("fileId is required");
  return apiRequest(`/api/2.0/files/file/${encodeURIComponent(id)}`, { auth });
}

export async function getFileExternalLinks(fileId, auth) {
  const id = String(fileId || "").trim();
  if (!id) throw new Error("fileId is required");
  return apiRequest(`/api/2.0/files/file/${encodeURIComponent(id)}/links`, { auth });
}

function normalizeLinkEntry(entry) {
  const shared = entry?.sharedLink || entry?.sharedTo || entry?.shared || entry || {};
  const shareLink = shared?.shareLink || entry?.shareLink || null;
  const requestToken = shared?.requestToken || entry?.requestToken || null;
  const title = shared?.title || entry?.title || "";
  const linkType = shared?.linkType ?? entry?.linkType ?? null;
  const internal = shared?.internal ?? entry?.internal ?? null;
  const primary = shared?.primary ?? entry?.primary ?? null;

  return {
    id: shared?.id || entry?.id || null,
    title: String(title || ""),
    shareLink: shareLink ? String(shareLink) : null,
    requestToken: requestToken ? String(requestToken) : null,
    linkType,
    internal: typeof internal === "boolean" ? internal : null,
    primary: typeof primary === "boolean" ? primary : null
  };
}

export async function getFillOutLink(fileId, auth) {
  const links = await getFileExternalLinks(fileId, auth);
  const normalized = (links || []).map(normalizeLinkEntry).filter((l) => l.shareLink);
  const preferred =
    normalized.find((l) => l.title.toLowerCase() === "link to fill out") ||
    normalized.find((l) => l.title.toLowerCase().includes("fill out")) ||
    normalized.find((l) => l.linkType === 1) ||
    normalized.find((l) => l.primary && l.internal === false) ||
    normalized.find((l) => l.internal === false) ||
    null;
  return preferred || null;
}

export async function ensureExternalLinkAccess(fileId, { access = "FillForms", title } = {}, auth) {
  const fid = String(fileId || "").trim();
  if (!fid) throw new Error("fileId is required");
  const desiredAccess = String(access || "").trim();
  if (!desiredAccess) throw new Error("access is required");

  const links = await getFileExternalLinks(fid, auth);
  const normalized = (links || []).map(normalizeLinkEntry).filter((l) => l.shareLink);
  const existing =
    normalized.find((l) => l.primary && l.internal === false && l.id) ||
    normalized.find((l) => l.internal === false && l.id) ||
    normalized.find((l) => l.id) ||
    null;

  const body = {
    access: desiredAccess,
    internal: false,
    primary: true
  };
  if (existing?.id) body.linkId = String(existing.id);
  if (title) body.title = String(title).slice(0, 255);

  await apiRequest(`/api/2.0/files/file/${encodeURIComponent(fid)}/links`, {
    method: "PUT",
    auth,
    body
  });

  const after = await getFileExternalLinks(fid, auth);
  const updated = (after || []).map(normalizeLinkEntry).filter((l) => l.shareLink);
  const picked =
    updated.find((l) => l.primary && l.internal === false) ||
    updated.find((l) => l.internal === false) ||
    updated[0] ||
    null;
  return picked || null;
}

export async function setFileExternalLink(fileId, auth = "", { access = "ReadWrite" } = {}) {
  const fid = String(fileId || "").trim();
  if (!fid) throw new Error("fileId is required");

  const body = { access, internal: false, primary: true };

  try {
    const response = await apiRequest(`/api/2.0/files/file/${encodeURIComponent(fid)}/links`, {
      method: "PUT",
      auth,
      body
    });
    const sharedLinkObj = response?.sharedLink || response?.sharedTo || null;
    const shared = sharedLinkObj?.shareLink || response?.shareLink || null;
    const requestToken = sharedLinkObj?.requestToken || response?.requestToken || null;
    return { shareLink: shared ? String(shared) : null, requestToken: requestToken ? String(requestToken) : null };
  } catch (error) {
    if (auth && error?.status === 403) {
      const response = await apiRequest(`/api/2.0/files/file/${encodeURIComponent(fid)}/links`, {
        method: "PUT",
        body
      });
      const sharedLinkObj = response?.sharedLink || response?.sharedTo || null;
      const shared = sharedLinkObj?.shareLink || response?.shareLink || null;
      const requestToken = sharedLinkObj?.requestToken || response?.requestToken || null;
      return { shareLink: shared ? String(shared) : null, requestToken: requestToken ? String(requestToken) : null };
    }
    throw error;
  }
}

