const portalUrl = import.meta.env.VITE_DOCSPACE_URL || "";
const sessionKey = "docflow.portal.session";

export function mockSession() {
  const raw = localStorage.getItem(sessionKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function loginUser({ email, password }) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "DocSpace login failed");
  }

  const session = buildSessionFromBackend(data);
  storeSession(session);
  return session;
}

export async function registerPatient(payload) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    const details =
      typeof data?.details === "string"
        ? data.details
        : data?.details
        ? JSON.stringify(data.details)
        : "";
    const message = data?.error || "DocSpace registration failed";
    throw new Error(details ? `${message}: ${details}` : message);
  }

  const session = buildSessionFromBackend(data);
  if (data?.warnings?.length) {
    session.warnings = data.warnings;
  }
  storeSession(session);
  return session;
}

export async function updateProfile({ userId, roomId, ...payload }) {
  const response = await fetch("/api/documents/update-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, roomId, ...payload })
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw };
  }
  if (!response.ok) {
    const details =
      typeof data?.details === "string"
        ? data.details
        : data?.details
        ? JSON.stringify(data.details)
        : "";
    const message = data?.error || `Profile update failed (${response.status})`;
    throw new Error(details ? `${message}: ${details}` : message);
  }

  const current = mockSession();
  const session = buildSessionFromBackend({
    ...data,
    token: data?.token || current?.session?.user?.token || null
  });
  if (Array.isArray(data?.warnings) && data.warnings.length) {
    session.warnings = data.warnings;
  }
  storeSession(session);
  return session;
}

export async function getSession() {
  return mockSession()?.session || null;
}

export async function logoutUser() {
  localStorage.removeItem(sessionKey);
}

export async function getApplicationTypes() {
  const response = await fetch("/api/applications/types");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load application types");
  }
  return data.types || [];
}

export async function createApplication({ roomId, user, typeKey, fields }) {
  const response = await fetch("/api/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, user, typeKey, fields })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to create application");
  }
  return data.application;
}

export async function listApplications({ roomId } = {}) {
  const query = roomId ? `?roomId=${encodeURIComponent(roomId)}` : "";
  const response = await fetch(`/api/applications${query}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load applications");
  }
  return data.applications || [];
}

export async function getApplication(applicationId) {
  const response = await fetch(`/api/applications/${applicationId}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load application");
  }
  return data;
}

export async function getRoomSummary({ roomId, token }) {
  const headers = token ? { Authorization: token } : undefined;
  const response = await fetch(`/api/documents/room-summary?roomId=${roomId}`, {
    headers
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load room summary");
  }
  return data.summary || [];
}

export async function getFolderContents({ folderId, token }) {
  const headers = token ? { Authorization: token } : undefined;
  const response = await fetch(`/api/documents/folder-contents?folderId=${folderId}`, {
    headers
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load folder contents");
  }
  return data.contents;
}

export async function uploadLocalToFolder({ folderId, fileName }) {
  const response = await fetch("/api/documents/upload-local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId, fileName })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Upload failed");
  }
  return data.file || null;
}

export async function copyFileToFolder({ fileId, destFolderId }) {
  const response = await fetch("/api/documents/copy-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, destFolderId })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Copy failed");
  }
  return data.file || null;
}

export async function uploadLocalApplicationFile({
  applicationId,
  folderId,
  fileName,
  requiredKey
}) {
  const response = await fetch(`/api/applications/${applicationId}/upload-local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId, fileName, requiredKey })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Upload failed");
  }
  return data;
}

export async function uploadCopyApplicationFile({
  applicationId,
  fileId,
  destFolderId,
  requiredKey
}) {
  const response = await fetch(`/api/applications/${applicationId}/upload-copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, destFolderId, requiredKey })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Copy failed");
  }
  return data;
}

export async function submitApplication(applicationId) {
  const response = await fetch(`/api/applications/${applicationId}/submit`, {
    method: "POST"
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Submit failed");
  }
  return data.application;
}

export async function listRequests({ roomId } = {}) {
  const query = roomId ? `?roomId=${encodeURIComponent(roomId)}` : "";
  const response = await fetch(`/api/requests${query}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load requests");
  }
  return data.requests || [];
}

export async function uploadLocalRequestFile({
  requestId,
  folderId,
  fileName,
  requiredKey
}) {
  const response = await fetch(`/api/requests/${requestId}/upload-local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId, fileName, requiredKey })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Upload failed");
  }
  return data;
}

export async function uploadCopyRequestFile({
  requestId,
  fileId,
  destFolderId,
  requiredKey
}) {
  const response = await fetch(`/api/requests/${requestId}/upload-copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, destFolderId, requiredKey })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Copy failed");
  }
  return data;
}

function buildSessionFromBackend({ user, room, token }) {
  const resolvedPhone =
    user.contacts?.find((contact) => /phone/i.test(contact.type))?.value ||
    user.mobilePhone ||
    user.phone ||
    "-";
  const resolvedBirthday =
    (user.birthday?.utcTime || user.birthDate || user.birthday || "")
      .toString()
      .slice(0, 10);
  const resolvedSex =
    typeof user.sex === "boolean"
      ? user.sex
        ? "Male"
        : "Female"
      : user.sex || "";
  const nameFromParts = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const fullName =
    nameFromParts || user.displayName || user.fullName || "DocSpace user";
  const email = user.email || "";
  const phone = resolvedPhone;
  const initials = fullName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return {
    user: {
      fullName,
      email,
      phone,
      initials,
      docspaceId: user.id || "DOCSPACE",
      role: user.isAdmin ? "Admin" : "Citizen",
      sex: resolvedSex,
      birthday: resolvedBirthday,
      location: user.location || "",
      title: user.title || "",
      comment: user.comment || "",
      token: token || null
    },
    room: room?.id
      ? {
          id: room.id,
          name: room?.title || room?.name || `${fullName} - Document Flow Room`,
          url: room?.webUrl || room?.url || (portalUrl ? `${portalUrl}/rooms/shared/${room.id}` : "")
        }
      : null,
    view: "documents"
  };
}

function storeSession(session) {
  localStorage.setItem(sessionKey, JSON.stringify({ session, view: "documents" }));
}


export async function createFileShareLink({ fileId, token }) {
  if (!fileId) {
    throw new Error("fileId is required");
  }
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = token;
  }
  const response = await fetch("/api/documents/file-share-link", {
    method: "POST",
    headers,
    body: JSON.stringify({ fileId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || `Share link failed (${response.status})`;
    throw new Error(message);
  }
  return data.link || null;
}

