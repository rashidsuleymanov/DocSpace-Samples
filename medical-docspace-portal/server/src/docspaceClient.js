import { config } from "./config.js";

const baseUrl = config.baseUrl;
const authHeader = config.rawAuthToken ? normalizeAuthHeader(config.rawAuthToken) : "";
const doctorEmail = config.doctorEmail;
const doctorAccess = config.doctorAccess;
const patientAccess = config.patientAccess;
const formsRoomTitle = config.formsRoomTitle;
const formsRoomTitleFallbacks = config.formsRoomTitleFallbacks || [];
const formsTemplatesFolderTitle = config.formsTemplatesFolderTitle;
const labRoomTitle = config.labRoomTitle;
const labRoomTitleFallbacks = config.labRoomTitleFallbacks || [];
const ticketTemplateId = config.ticketTemplateId;
const medicalRecordTemplateId = config.medicalRecordTemplateId;

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
  if (requiresAuth && !authHeader) {
    throw new Error("DOCSPACE_AUTH_TOKEN is not set");
  }
}

async function apiRequest(path, { method = "GET", body, auth } = {}) {
  requireConfig({ requiresAuth: !auth });
  const authorization = normalizeAuthHeader(auth || authHeader);
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

async function apiRequestRaw(path, { method = "GET", body, auth } = {}) {
  requireConfig({ requiresAuth: !auth });
  const authorization = normalizeAuthHeader(auth || authHeader);
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw };
  }

  if (!response.ok) {
    const message = data?.error || data?.message || response.statusText;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return { data, raw, status: response.status };
}

async function apiRequestForm(path, { method = "POST", body, auth } = {}) {
  requireConfig({ requiresAuth: !auth });
  const authorization = normalizeAuthHeader(auth || authHeader);
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: authorization
    },
    body
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

export async function getFileExternalLinks(fileId, auth) {
  if (!fileId) return [];
  const response = await apiRequest(`/api/2.0/files/file/${fileId}/links`, { auth });
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.response)) return response.response;
  if (Array.isArray(response?.links)) return response.links;
  return [];
}

function normalizeLinkEntry(entry) {
  const shared =
    entry?.sharedLink ||
    entry?.sharedTo ||
    entry?.shared ||
    entry?.link ||
    null;
  const title = shared?.title || entry?.title || "";
  const shareLink = shared?.shareLink || entry?.shareLink || null;
  const requestToken = shared?.requestToken || entry?.requestToken || null;
  const linkType = shared?.linkType ?? entry?.linkType ?? null;
  const access = entry?.access ?? null;
  const internal = shared?.internal ?? entry?.internal ?? null;
  const primary = shared?.primary ?? entry?.primary ?? null;
  return {
    id: shared?.id || entry?.id || null,
    title: String(title || ""),
    shareLink: shareLink ? String(shareLink) : null,
    requestToken: requestToken ? String(requestToken) : null,
    linkType,
    access,
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
  if (existing?.id) {
    body.linkId = String(existing.id);
  }
  if (title) {
    body.title = String(title).slice(0, 255);
  }

  await apiRequest(`/api/2.0/files/file/${fid}/links`, {
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


export async function getSelfProfileBasic({ login, password }) {
  const token = Buffer.from(`${login}:${password}`).toString("base64");
  return apiRequest("/api/2.0/people/@self", {
    auth: `Basic ${token}`
  });
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
  if (!token) {
    throw new Error("User token is required");
  }
  return apiRequest("/api/2.0/people/@self", { auth: token });
}

export async function getUserById(userId) {
  if (!userId) return null;
  return apiRequest(`/api/2.0/portal/users/${userId}`);
}

export async function getProfileByUserId(userId) {
  if (!userId) return null;
  return apiRequest(`/api/2.0/people/${userId}`);
}

export async function getAdminProfile() {
  return apiRequest("/api/2.0/people/@self");
}

export async function getTokenClaims() {
  return apiRequest("/api/2.0/people/tokendiagnostics");
}

function splitFullName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  const [firstName, ...rest] = parts;
  return { firstName, lastName: rest.join(" ") };
}

export async function findRoomByTitle(title, auth) {
  return findRoomByCandidates([title], auth);
}

export async function findRoomByCandidates(titles, auth) {
  const candidates = (titles || []).filter(Boolean);
  if (!candidates.length) return null;
  const roomsFolder = await apiRequest("/api/2.0/files/rooms", { auth });
  const folders = roomsFolder?.folders || [];
  const normalizedCandidates = candidates.map((item) => normalize(item));
  const match = folders.find((room) =>
    normalizedCandidates.includes(normalize(room.title))
  );
  if (!match) return null;
  return {
    id: match.id,
    title: match.title,
    webUrl: match.webUrl || match.shortWebUrl || null
  };
}

export async function listRooms(auth) {
  const roomsFolder = await apiRequest("/api/2.0/files/rooms", { auth });
  return roomsFolder?.folders || [];
}

export async function createDocSpaceUser({ fullName, email, password }) {
  const { firstName, lastName } = splitFullName(fullName);

  return apiRequest("/api/2.0/people", {
    method: "POST",
    body: {
      firstName,
      lastName,
      email,
      password,
      type: "User",
      isUser: true
    }
  });
}

export async function createPatientRoom({ fullName, userId }) {
  return apiRequest("/api/2.0/files/rooms", {
    method: "POST",
    body: {
      title: `${fullName} - Patient Room`,
      roomType: 2
    }
  });
}

export async function createMedicalRoom() {
  // 1 = Form filling room (FillingFormsRoom) per DocSpace API docs.
  return apiRequest("/api/2.0/files/rooms", {
    method: "POST",
    body: {
      title: formsRoomTitle || "Medical Room",
      roomType: 1
    }
  });
}

export async function getFormsRoom(auth) {
  const candidates = [formsRoomTitle, ...formsRoomTitleFallbacks, "Medical Room", "Medical Forms"]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return findRoomByCandidates(candidates, auth);
}

export async function requireFormsRoom(auth) {
  const room = await getFormsRoom(auth);
  if (!room?.id) {
    const names = [formsRoomTitle, ...formsRoomTitleFallbacks].filter(Boolean).join(", ");
    throw new Error(`Forms room not found. Configure DOCSPACE_FORMS_ROOM_TITLE (candidates: ${names || "Medical Room, Medical Forms"}).`);
  }
  return room;
}

export async function getLabRoom(auth) {
  const candidates = [labRoomTitle, ...labRoomTitleFallbacks, "Lab Results", "Labs Results"]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return findRoomByCandidates(candidates, auth);
}

export async function requireLabRoom(auth) {
  const room = await getLabRoom(auth);
  if (!room?.id) {
    const names = [labRoomTitle, ...labRoomTitleFallbacks].filter(Boolean).join(", ");
    throw new Error(`Lab room not found. Configure DOCSPACE_LAB_ROOM_TITLE (candidates: ${names || "Lab Results, Labs Results"}).`);
  }
  return room;
}

export async function getFormsRoomFolders(roomId, auth) {
  const rid = String(roomId || "").trim();
  if (!rid) throw new Error("roomId is required");

  // Form Filling rooms have system folders. We rely on titles to avoid needing locale-specific rootFolderType mapping.
  // If your portal localizes folder names, set up a dedicated templates folder and keep these English titles.
  const [inProcess, complete, templates] = await Promise.all([
    getFolderByTitleWithin(rid, "In Process").catch(() => null),
    getFolderByTitleWithin(rid, "Complete").catch(() => null),
    formsTemplatesFolderTitle ? getFolderByTitleWithin(rid, formsTemplatesFolderTitle).catch(() => null) : Promise.resolve(null)
  ]);

  if (!inProcess?.id) {
    throw new Error("Forms room folder not found: In Process");
  }
  if (!complete?.id) {
    throw new Error("Forms room folder not found: Complete");
  }

  return {
    inProcess,
    complete,
    templates: templates?.id ? templates : null
  };
}

export async function createPatientFolders({ roomId }) {
  const folderTitles = [
    "Personal Data",
    "Contracts",
    "Lab Results",
    "Medical Records",
    "Appointments",
    "Fill & Sign",
    "Sick Leave",
    "Insurance",
    "Prescriptions",
    "Imaging"
  ];

  const folders = [];
  for (const title of folderTitles) {
    const folder = await apiRequest(`/api/2.0/files/folder/${roomId}`, {
      method: "POST",
      body: { title }
    });
    folders.push(normalizeFolder(folder));
  }

  const fillFolder = folders.find((folder) => normalize(folder.title) === "fill & sign");
  if (fillFolder?.id) {
    const subfolders = ["In Process", "Complete"];
    for (const title of subfolders) {
      const sub = await apiRequest(`/api/2.0/files/folder/${fillFolder.id}`, {
        method: "POST",
        body: { title }
      });
      folders.push(normalizeFolder(sub));
    }
  }

  return { roomId, folders };
}


export async function getUserByEmail(email) {
  if (!email) return null;
  return apiRequest(`/api/2.0/people/email?email=${encodeURIComponent(email)}`);
}

export async function searchUsers(query, auth) {
  const q = String(query || "").trim();
  if (!q) return [];
  const response = await apiRequest(`/api/2.0/people/search?query=${encodeURIComponent(q)}`, { auth });
  // API returns an array in `response` for this endpoint (wrapped by apiRequest).
  return Array.isArray(response) ? response : [];
}

export async function getDoctorProfile() {
  if (!doctorEmail) return null;
  return getUserByEmail(doctorEmail);
}

export async function shareRoom({ roomId, invitations, notify = false, message }) {
  if (!roomId || !invitations?.length) return null;
  const body = { invitations, notify };
  if (message) {
    body.message = message;
  }
  return apiRequest(`/api/2.0/files/rooms/${roomId}/share`, {
    method: "PUT",
    body
  });
}

export async function shareFolder({ folderId, share, notify = false, sharingMessage }) {
  if (!folderId || !share?.length) return null;
  const body = { share, notify };
  if (sharingMessage) body.sharingMessage = sharingMessage;
  // Doc: PUT /api/2.0/files/folder/{folderId}/share
  return apiRequest(`/api/2.0/files/folder/${folderId}/share`, {
    method: "PUT",
    body
  });
}

export async function shareFile({ fileId, share, notify = false, message, auth } = {}) {
  if (!fileId || !share?.length) return null;
  const body = { share, notify };
  if (message) {
    body.message = message;
  }
  // Doc: PUT /api/2.0/files/file/{fileId}/share
  return apiRequest(`/api/2.0/files/file/${fileId}/share`, {
    method: "PUT",
    auth,
    body
  });
}

export async function lockFile({ fileId, lock = true, auth } = {}) {
  if (!fileId) throw new Error("fileId is required");
  // Doc: PUT /api/2.0/files/file/{id}/lock
  return apiRequest(`/api/2.0/files/file/${fileId}/lock`, {
    method: "PUT",
    auth,
    body: { lockFile: Boolean(lock) }
  });
}

export async function getFolderSecurityInfo(folderId, auth) {
  if (!folderId) return null;
  // Doc: GET /api/2.0/files/folder/{id}/share
  return apiRequest(`/api/2.0/files/folder/${folderId}/share`, { auth });
}

export async function ensureRoomMembers({ roomId, patientId }) {
  const invitations = [];

  if (patientId) {
    invitations.push({ id: patientId, access: patientAccess });
  }

  if (doctorEmail) {
    const doctor = await getUserByEmail(doctorEmail);
    if (doctor?.id) {
      invitations.push({ id: doctor.id, access: doctorAccess });
    } else {
      invitations.push({ email: doctorEmail, access: doctorAccess });
    }
  }

  if (!invitations.length) return null;
  return shareRoom({ roomId, invitations });
}

export async function ensureFolderByTitleWithin(parentId, title) {
  const existing = await getFolderByTitleWithin(parentId, title);
  if (existing?.id) return existing;
  const created = await apiRequest(`/api/2.0/files/folder/${parentId}`, {
    method: "POST",
    body: { title }
  });
  return normalizeFolder(created);
}

export async function ensureFolderPath(rootId, titles) {
  let currentId = rootId;
  const created = [];
  for (const title of titles || []) {
    if (!title) continue;
    const folder = await ensureFolderByTitleWithin(currentId, title);
    created.push(folder);
    currentId = folder.id;
  }
  return created;
}

export async function ensureMedicalRoom(auth) {
  const existing = await getFormsRoom(auth);
  if (existing?.id) return existing;
  const created = await createMedicalRoom();
  return {
    id: created?.id,
    title: created?.title || formsRoomTitle || "Medical Room",
    webUrl: created?.webUrl || created?.shortWebUrl || null
  };
}

export async function ensureMedicalPatientFolders({ userId, auth } = {}) {
  const uid = String(userId || "").trim();
  if (!uid) throw new Error("userId is required");

  const medicalRoom = await ensureMedicalRoom(auth);
  if (!medicalRoom?.id) {
    throw new Error("Failed to ensure Medical Room");
  }

  const [patientsRoot, patientRoot, inProcess, complete] = await ensureFolderPath(medicalRoom.id, [
    "Patients",
    uid,
    "In Process"
  ]).then(async (folders) => {
    const patients = folders[0];
    const patient = folders[1];
    const inProc = folders[2];
    const completeFolder = await ensureFolderByTitleWithin(patient.id, "Complete");
    return [patients, patient, inProc, completeFolder];
  });

  // Share only patient-specific folders (least privilege).
  // Note: some portals require access to the parent folder entry to browse child folders via API,
  // so we share the patient root as Read as well (still scoped to this patient only).
  await shareFolder({
    folderId: patientRoot.id,
    share: [{ shareTo: uid, access: "Read" }],
    notify: false
  }).catch((e) => {
    console.warn("[medical-room] share patientRoot failed", e?.message || e);
    return null;
  });

  await shareFolder({
    folderId: inProcess.id,
    share: [{ shareTo: uid, access: "FillForms" }],
    notify: false
  }).catch((e) => {
    console.warn("[medical-room] share inProcess failed", e?.message || e);
    return null;
  });

  await shareFolder({
    folderId: complete.id,
    share: [{ shareTo: uid, access: "Read" }],
    notify: false
  }).catch((e) => {
    console.warn("[medical-room] share complete failed", e?.message || e);
    return null;
  });

  return { medicalRoom, patientsRoot, patientRoot, inProcess, complete };
}

export async function getRoomSummary(roomId, auth) {
  const content = await apiRequest(`/api/2.0/files/${roomId}`, { auth });
  const folders = content?.folders || [];

  return folders.map((folder) => ({
    id: folder.id,
    title: folder.title,
    filesCount: folder.filesCount ?? 0,
    foldersCount: folder.foldersCount ?? 0
  }));
}

export async function getRoomFolderByTitle(roomId, title) {
  if (!roomId || !title) return null;
  const content = await apiRequest(`/api/2.0/files/${roomId}`);
  const folders = content?.folders || [];
  const target = normalize(title);
  const exact = folders.find((folder) => normalize(folder.title) === target);
  const match = exact || folders.find((folder) => normalize(folder.title).includes(target));
  return match ? normalizeFolder(match) : null;
}

export async function getFolderByTitleWithin(parentId, title) {
  if (!parentId || !title) return null;
  const content = await apiRequest(`/api/2.0/files/${parentId}`);
  const folders = content?.folders || [];
  const target = normalize(title);
  const exact = folders.find((folder) => normalize(folder.title) === target);
  const match = exact || folders.find((folder) => normalize(folder.title).includes(target));
  return match ? normalizeFolder(match) : null;
}

export async function ensureRoomFolderByTitle(roomId, title) {
  const existing = await getRoomFolderByTitle(roomId, title);
  if (existing?.id) return existing;
  const created = await apiRequest(`/api/2.0/files/folder/${roomId}`, {
    method: "POST",
    body: { title }
  });
  return normalizeFolder(created);
}

async function createEmptyDoc({ folderId, title }) {
  if (!folderId || !title) return null;
  return apiRequest(`/api/2.0/files/${folderId}/file`, {
    method: "POST",
    body: { title }
  });
}

async function updateFileTitle({ fileId, title }) {
  if (!fileId || !title) return null;
  // Some portals support renaming via PUT /api/2.0/files/file/{id}.
  return apiRequest(`/api/2.0/files/file/${fileId}`, {
    method: "PUT",
    body: { title }
  });
}

export async function createRoomFileFromTemplate({ roomId, folderTitle, templateFileId, title }) {
  const fid = String(templateFileId || medicalRecordTemplateId || "").trim();
  if (!roomId) throw new Error("roomId is required");
  if (!folderTitle) throw new Error("folderTitle is required");
  if (!fid) throw new Error("templateFileId is required");

  const folder = await ensureRoomFolderByTitle(roomId, folderTitle);
  if (!folder?.id) throw new Error(`${folderTitle} folder not found in room`);

  const before = await getFolderContents(folder.id).catch(() => null);
  const beforeIds = new Set((before?.items || []).map((i) => String(i.id)));

  await copyFileToFolder({ fileId: fid, destFolderId: folder.id });

  const after = await getFolderContents(folder.id).catch(() => null);
  const afterFiles = (after?.items || []).filter((item) => item.type === "file");
  const created = afterFiles.find((item) => !beforeIds.has(String(item.id))) || afterFiles[0] || null;
  const createdId = created?.id ? String(created.id) : null;
  if (!createdId) {
    throw new Error("Unable to determine created file after template copy");
  }

  const desiredTitle = title ? String(title) : "";
  if (desiredTitle) {
    await updateFileTitle({ fileId: createdId, title: desiredTitle }).catch(() => null);
  }

  const info = await apiRequest(`/api/2.0/files/file/${createdId}`).catch(() => null);
  let webUrl = info?.webUrl || info?.viewUrl || null;
  let shareToken = null;
  try {
    const linkInfo = await createFileShareLink(createdId, "ReadWrite");
    webUrl = linkInfo?.shareLink || webUrl;
    shareToken = linkInfo?.shareToken || extractShareToken(webUrl);
  } catch {
    shareToken = extractShareToken(webUrl);
  }

  return {
    id: createdId,
    title: info?.title || created?.title || title || "Document",
    webUrl,
    shareToken
  };
}

async function createFileShareLink(fileId, access = "ReadWrite") {
  try {
    const link = await apiRequest(`/api/2.0/files/file/${fileId}/link`, {
      method: "PUT",
      body: { access }
    });
    const shareLink = link?.sharedLink?.shareLink || link?.shareLink || null;
    return { shareLink, shareToken: extractShareToken(shareLink) };
  } catch {
    const existing = await apiRequest(`/api/2.0/files/file/${fileId}/link`).catch(() => null);
    const shareLink = existing?.sharedLink?.shareLink || existing?.shareLink || null;
    return { shareLink, shareToken: extractShareToken(shareLink) };
  }
}

export async function copyFileToFolder({ fileId, destFolderId, toFillOut = false }) {
  if (!fileId || !destFolderId) {
    throw new Error("fileId and destFolderId are required");
  }
  // Use the bulk fileops copy endpoint; copyas is brittle on some portals.
  return apiRequest("/api/2.0/files/fileops/copy", {
    method: "PUT",
    body: {
      fileIds: [String(fileId)],
      destFolderId: String(destFolderId),
      deleteAfter: false,
      content: true,
      toFillOut: Boolean(toFillOut)
    }
  });
}

export async function uploadFileToFolder(
  { folderId, fileName, buffer, contentType = "application/octet-stream" } = {},
  auth
) {
  const fid = String(folderId || "").trim();
  const name = String(fileName || "").trim();
  if (!fid) throw new Error("folderId is required");
  if (!name) throw new Error("fileName is required");
  if (!buffer) throw new Error("buffer is required");

  const form = new FormData();
  const blob = new Blob([buffer], { type: contentType || "application/octet-stream" });
  form.append("file", blob, name);

  return apiRequestForm(`/api/2.0/files/${encodeURIComponent(fid)}/upload`, {
    method: "POST",
    body: form,
    auth
  });
}

export async function moveFileToFolder({ fileId, destFolderId }) {
  if (!fileId || !destFolderId) {
    throw new Error("fileId and destFolderId are required");
  }
  return apiRequest("/api/2.0/files/fileops/move", {
    method: "PUT",
    body: {
      fileIds: [String(fileId)],
      destFolderId: String(destFolderId),
      deleteAfter: true,
      content: true,
      toFillOut: false
    }
  });
}

export async function getFileInfo(fileId) {
  if (!fileId) return null;
  return apiRequest(`/api/2.0/files/file/${fileId}`);
}

export async function startFilling(fileId, auth) {
  const fid = String(fileId || "").trim();
  if (!fid) throw new Error("fileId is required");
  // Doc: PUT /api/2.0/files/file/{fileId}/startfilling
  return apiRequest(`/api/2.0/files/file/${fid}/startfilling`, {
    method: "PUT",
    auth
  });
}

export async function setFileExternalLink(fileId, auth = "", { access = "ReadWrite" } = {}) {
  if (!fileId) {
    throw new Error("fileId is required");
  }
  const body = {
    access,
    internal: false,
    primary: true,
  };
  try {
    const response = await apiRequest(`/api/2.0/files/file/${fileId}/links`, {
      method: "PUT",
      auth,
      body
    });
    const sharedLinkObj = response?.sharedLink || response?.sharedTo || null;
    const shared = sharedLinkObj?.shareLink || response?.shareLink || null;
    const requestToken = sharedLinkObj?.requestToken || response?.requestToken || null;
    if (!shared) {
      const fallback = await getFillOutLink(fileId, auth).catch(() => null);
      if (fallback?.shareLink) {
        return {
          shareLink: fallback.shareLink,
          shareToken: extractShareToken(fallback.shareLink),
          requestToken: fallback.requestToken || null
        };
      }
    }
    return {
      shareLink: shared,
      shareToken: extractShareToken(shared),
      requestToken: requestToken ? String(requestToken) : null
    };
  } catch (error) {
    // Patient tokens often cannot create external links; retry with admin token.
    if (auth && error?.status === 403) {
      const response = await apiRequest(`/api/2.0/files/file/${fileId}/links`, {
        method: "PUT",
        body
      });
      const sharedLinkObj = response?.sharedLink || response?.sharedTo || null;
      const shared = sharedLinkObj?.shareLink || response?.shareLink || null;
      const requestToken = sharedLinkObj?.requestToken || response?.requestToken || null;
      if (!shared) {
        const fallback = await getFillOutLink(fileId).catch(() => null);
        if (fallback?.shareLink) {
          return {
            shareLink: fallback.shareLink,
            shareToken: extractShareToken(fallback.shareLink),
            requestToken: fallback.requestToken || null
          };
        }
      }
      return {
        shareLink: shared,
        shareToken: extractShareToken(shared),
        requestToken: requestToken ? String(requestToken) : null
      };
    }
    throw error;
  }
}

export async function createRoomDocument({ roomId, folderTitle, title }) {
  const folder = await ensureRoomFolderByTitle(roomId, folderTitle);
  if (!folder?.id) {
    throw new Error(`${folderTitle} folder not found in room`);
  }
  const file = await createEmptyDoc({ folderId: folder.id, title });
  if (!file?.id) return file;
  const info = await apiRequest(`/api/2.0/files/file/${file.id}`).catch(() => null);
  let webUrl = info?.webUrl || info?.viewUrl || file?.webUrl || file?.viewUrl || null;
  const linkInfo = await createFileShareLink(file.id, "ReadWrite");
  webUrl = linkInfo.shareLink || webUrl;
  return {
    ...file,
    webUrl,
    shareToken: linkInfo.shareToken || extractShareToken(webUrl)
  };
}

export async function createAppointmentTicket({ roomId, appointment }) {
  const targetFolder = await ensureRoomFolderByTitle(roomId, "Appointments");
  if (!targetFolder?.id) {
    throw new Error("Appointments folder not found in room");
  }
  const safeDate = String(appointment?.date || "").replace(/[^0-9-]/g, "");
  const safeTime = String(appointment?.time || "").replace(/[^0-9:]/g, "");
  const doctor = appointment?.doctor || "Doctor";
  const destTitle = `Appointment ${safeDate} ${safeTime} - ${doctor}.docx`.trim();
  let createdFileId = null;
  let createdTitle = null;

  if (ticketTemplateId) {
    const before = await getFolderContents(targetFolder.id).catch(() => null);
    const beforeIds = new Set((before?.items || []).map((i) => String(i.id)));

    await copyFileToFolder({
      fileId: String(ticketTemplateId),
      destFolderId: targetFolder.id
    });

    const after = await getFolderContents(targetFolder.id).catch(() => null);
    const afterFiles = (after?.items || []).filter((item) => item.type === "file");
    const created = afterFiles.find((item) => !beforeIds.has(String(item.id))) || afterFiles[0] || null;
    createdFileId = created?.id ? String(created.id) : null;
    createdTitle = created?.title ? String(created.title) : null;
  }

  if (!createdFileId) {
    const file = await createEmptyDoc({
      folderId: targetFolder.id,
      title: destTitle
    });
    createdFileId = file?.id ? String(file.id) : null;
    createdTitle = file?.title ? String(file.title) : null;
  }

  if (!createdFileId) return null;

  if (destTitle && createdTitle && createdTitle !== destTitle) {
    await updateFileTitle({ fileId: createdFileId, title: destTitle }).catch(() => null);
  }

  const info = await apiRequest(`/api/2.0/files/file/${createdFileId}`);
  let webUrl = info?.webUrl || info?.viewUrl || null;
  let shareToken = null;
  try {
    // Prefer the classic /link endpoint (works well with DocSpace SDK `requestToken` in our sample UIs).
    const linkInfo = await createFileShareLink(createdFileId, "ReadWrite");
    webUrl = linkInfo?.shareLink || webUrl;
    shareToken = linkInfo?.shareToken || extractShareToken(webUrl);
  } catch {
    try {
      // Fallback: external link via /links (some portals enforce it).
      const linkInfo = await setFileExternalLink(createdFileId, "", { access: "ReadWrite" });
      webUrl = linkInfo?.shareLink || webUrl;
      shareToken = linkInfo?.requestToken || linkInfo?.shareToken || extractShareToken(webUrl);
    } catch {
      shareToken = extractShareToken(webUrl);
    }
  }
  return {
    id: createdFileId,
    title: info?.title || createdTitle || destTitle,
    webUrl,
    shareToken
  };
}

function normalizeFolder(folder) {
  return {
    id: folder?.id,
    title: folder?.title
  };
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function extractShareToken(shareLink) {
  if (!shareLink) return null;
  try {
    const url = new URL(shareLink);
    const param = url.searchParams.get("share");
    if (param) return param;
    const parts = url.pathname.split("/").filter(Boolean);
    const sIndex = parts.indexOf("s");
    if (sIndex >= 0 && parts[sIndex + 1]) return parts[sIndex + 1];
    return null;
  } catch {
    return null;
  }
}

export async function getFolderContents(folderId, auth) {
  const content = await apiRequest(`/api/2.0/files/${folderId}`, { auth });
  const files = (content?.files || []).map((file) => ({
    id: file.id,
    title: file.title,
    type: "file",
    openUrl: file.webUrl || file.viewUrl || null
  }));
  const folders = (content?.folders || []).map((folder) => ({
    id: folder.id,
    title: folder.title,
    type: "folder"
  }));
  return {
    id: content?.id || folderId,
    title: content?.title || "Folder",
    items: [...folders, ...files]
  };
}

export async function getNewFolderItems(folderId, auth) {
  if (!folderId) return [];
  const response = await apiRequest(`/api/2.0/files/${folderId}/news`, { auth });
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.response)) return response.response;
  return [];
}

export async function getRoomInfo(roomId, auth) {
  if (!roomId) return null;
  const content = await apiRequest(`/api/2.0/files/${roomId}`, { auth });
  return {
    id: content?.id || roomId,
    title: content?.title || "Patient Room",
    webUrl: content?.webUrl || content?.shortWebUrl || null
  };
}

export async function getRoomSecurityInfo(roomId, auth) {
  if (!roomId) return null;
  // Doc: GET /api/2.0/files/rooms/{id}/share
  return apiRequest(`/api/2.0/files/rooms/${roomId}/share`, { auth });
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeSex(value) {
  if (typeof value === "number") {
    return value === 1 ? "male" : value === 0 ? "female" : "";
  }
  return String(value || "").trim().toLowerCase();
}


export async function updateMember({
  userId,
  fullName,
  email,
  phone,
  sex,
  location,
  title,
  comment
}) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const body = {};
  if (fullName) {
    const { firstName, lastName } = splitFullName(fullName);
    if (firstName) body.firstName = firstName;
    if (lastName) body.lastName = lastName;
  }
  if (email) {
    body.email = email;
  }
  body.isUser = true;
  body.disable = false;
  if (phone && String(phone).trim() !== "-" && String(phone).trim() !== "") {
    body.contacts = [{ type: "Phone", value: phone }];
    body.mobilePhone = phone;
  }
  if (sex !== undefined && sex !== null && sex !== "") {
    if (typeof sex === "number") {
      body.sex = sex === 1 ? 1 : 0;
    } else {
      const normalized = String(sex).trim().toLowerCase();
      if (normalized === "male") {
        body.sex = 1;
      } else if (normalized === "female") {
        body.sex = 0;
      } else {
        throw new Error("Invalid sex value. Use Male/Female.");
      }
    }
  }
  if (location) {
    body.location = location;
  }
  if (title) {
    body.title = title;
  }
  if (comment) {
    body.comment = comment;
  }

  if (!Object.keys(body).length) {
    throw new Error("No profile fields to update");
  }

  body.userId = userId;
  const payloadLog = {
    ...body,
    contacts: body.contacts ? "[redacted]" : undefined
  };

  let data;
  try {
    const response = await apiRequestRaw(`/api/2.0/people/${userId}`, {
      method: "PUT",
      body
    });
    data = response.data;
  } catch (error) {
    if (error?.details && typeof error.details === "object") {
      error.details.request = payloadLog;
    }
    throw error;
  }
  if (data?.statusCode && data.statusCode !== 200) {
    const error = new Error(`DocSpace update failed (${data.statusCode})`);
    error.status = data.statusCode;
    error.details = data;
    throw error;
  }
  const updated = data?.response ?? data;

  const profile = await getProfileByUserId(userId).catch(() => null);
  if (!profile) {
    return updated;
  }

  const mismatches = [];
  if (body.firstName && profile.firstName !== body.firstName) {
    mismatches.push("firstName");
  }
  if (body.lastName && profile.lastName !== body.lastName) {
    mismatches.push("lastName");
  }
  if (body.email && profile.email !== body.email) {
    mismatches.push("email");
  }
  if (body.contacts?.length) {
    const targetPhone = normalizePhone(body.contacts[0]?.value);
    const profilePhone =
      normalizePhone(
        profile.contacts?.find((contact) => /phone/i.test(contact.type))?.value
      ) || normalizePhone(profile.mobilePhone);
    if (targetPhone && targetPhone !== profilePhone) {
      mismatches.push("phone");
    }
  }
  if (body.sex !== undefined) {
    if (normalizeSex(body.sex) !== normalizeSex(profile.sex)) {
      mismatches.push("sex");
    }
  }
  if (body.location && profile.location !== body.location) {
    mismatches.push("location");
  }
  if (body.title && profile.title !== body.title) {
    mismatches.push("title");
  }
  if (body.comment && profile.comment !== body.comment) {
    mismatches.push("comment");
  }

  const warnings =
    mismatches.length > 0
      ? [`DocSpace did not apply changes: ${mismatches.join(", ")}.`]
      : [];

  return { user: profile, warnings, requested: body };
}
