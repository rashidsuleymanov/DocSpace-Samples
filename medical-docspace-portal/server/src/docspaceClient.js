import { config } from "./config.js";

const baseUrl = config.baseUrl;
const authHeader = config.rawAuthToken ? normalizeAuthHeader(config.rawAuthToken) : "";
const doctorEmail = config.doctorEmail;
const doctorAccess = config.doctorAccess;
const patientAccess = config.patientAccess;

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

export async function copyFileToFolder({ fileId, destFolderId }) {
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
      toFillOut: false
    }
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

export async function setFileExternalLink(fileId, auth) {
  if (!fileId) {
    throw new Error("fileId is required");
  }
  const body = {
    access: "Read",
    internal: false,
    primary: true,
  };
  try {
    const response = await apiRequest(`/api/2.0/files/file/${fileId}/links`, {
      method: "PUT",
      auth,
      body
    });
    const shared = response?.sharedLink?.shareLink || response?.shareLink || null;
    return {
      shareLink: shared,
      shareToken: extractShareToken(shared)
    };
  } catch (error) {
    // Patient tokens often cannot create external links; retry with admin token.
    if (auth && error?.status === 403) {
      const response = await apiRequest(`/api/2.0/files/file/${fileId}/links`, {
        method: "PUT",
        body
      });
      const shared = response?.sharedLink?.shareLink || response?.shareLink || null;
      return {
        shareLink: shared,
        shareToken: extractShareToken(shared)
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
  const file = await createEmptyDoc({
    folderId: targetFolder.id,
    title: destTitle
  });
  if (!file?.id) return file;
  const info = await apiRequest(`/api/2.0/files/file/${file.id}`);
  let webUrl = info?.webUrl || info?.viewUrl || file?.webUrl || file?.viewUrl || null;
  let shareToken = null;
  try {
    const linkInfo = await setFileExternalLink(file.id);
    webUrl = linkInfo?.shareLink || webUrl;
    shareToken = linkInfo?.shareToken || extractShareToken(webUrl);
  } catch {
    shareToken = extractShareToken(webUrl);
  }
  return {
    ...file,
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
  console.log("[docspace] updateMember payload", payloadLog);

  let data;
  let raw;
  let status;
  try {
    const response = await apiRequestRaw(`/api/2.0/people/${userId}`, {
      method: "PUT",
      body
    });
    data = response.data;
    raw = response.raw;
    status = response.status;
    console.log("[docspace] updateMember response", { status });
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
