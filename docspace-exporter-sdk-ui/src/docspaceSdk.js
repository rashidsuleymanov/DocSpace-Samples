export function normalizeAuthHeader(value) {
  if (!value) return "";
  const v = String(value).trim();
  if (!v) return "";
  if (v.startsWith("Bearer ") || v.startsWith("Basic ") || v.startsWith("ASC ")) return v;
  return `Bearer ${v}`;
}

export function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

export async function apiRequest(baseUrl, path, { method = "GET", token, json, body, raw = false } = {}) {
  const url = `${normalizeBaseUrl(baseUrl)}${path}`;
  const headers = {};
  if (token) headers.Authorization = normalizeAuthHeader(token);

  let payload = body;
  if (json) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(json);
  }

  const response = await fetch(url, { method, headers, body: payload });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = raw
    ? await response.text()
    : isJson
      ? await response.json().catch(() => ({}))
      : await response.text();

  if (!response.ok) {
    const message = (data && data?.error) || (data && data?.message) || response.statusText;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data?.response ?? data;
}

export async function getSelf(baseUrl, token) {
  return apiRequest(baseUrl, "/api/2.0/people/@self", { token });
}

export async function listRooms(baseUrl, token) {
  const data = await apiRequest(baseUrl, "/api/2.0/files/rooms", { token });
  return data?.folders || [];
}

export async function findRoomByTitle(baseUrl, token, title) {
  const rooms = await listRooms(baseUrl, token);
  const target = String(title || "").trim().toLowerCase();
  if (!target) return null;
  const exact = rooms.find((r) => String(r.title || "").trim().toLowerCase() === target);
  const match = exact || rooms.find((r) => String(r.title || "").trim().toLowerCase().includes(target));
  return match || null;
}

export async function ensureFolderByTitle(baseUrl, token, { roomId, folderTitle }) {
  const content = await apiRequest(baseUrl, `/api/2.0/files/${roomId}`, { token });
  const folders = content?.folders || [];
  const target = String(folderTitle || "").trim().toLowerCase();

  const existing = folders.find((f) => String(f.title || "").trim().toLowerCase() === target);
  if (existing?.id) return existing;

  const created = await apiRequest(baseUrl, `/api/2.0/files/folder/${roomId}`, {
    method: "POST",
    token,
    json: { title: folderTitle }
  });

  return created;
}

export async function uploadFileToFolder(baseUrl, token, { uploadTemplate, folderId, fileName, blob }) {
  const path = String(uploadTemplate || "").replace("{folderId}", encodeURIComponent(String(folderId)));
  const form = new FormData();
  form.append("file", blob, fileName);

  return apiRequest(baseUrl, path, {
    method: "POST",
    token,
    body: form
  });
}
