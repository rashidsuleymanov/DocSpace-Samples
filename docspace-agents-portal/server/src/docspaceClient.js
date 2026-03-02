import { loadConfig } from "./config.js";

function normalizeAuthHeader(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  // If the user provides an explicit scheme (e.g. "Bearer ..."), keep it as-is.
  // Otherwise, DocSpace personal access tokens are often passed as a raw value in `Authorization`.
  if (/\s/.test(trimmed)) return trimmed;
  return trimmed;
}

export function createDocSpaceClient() {
  const cfg = loadConfig();
  const baseUrl = cfg.docspace.baseUrl;
  const authHeader = normalizeAuthHeader(cfg.docspace.authToken);

  async function apiRequestRaw(path, { method = "GET", body, auth } = {}) {
    const authorization = normalizeAuthHeader(auth || authHeader);
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(authorization ? { Authorization: authorization } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const raw = await res.text().catch(() => "");
    let data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = { raw };
      }
    }
    if (!res.ok) {
      const message =
        (typeof data?.error === "string" && data.error) ||
        (typeof data?.message === "string" && data.message) ||
        (typeof data?.raw === "string" && data.raw) ||
        res.statusText;
      const err = new Error(message);
      err.status = res.status;
      err.details = data;
      throw err;
    }
    return { res, raw, data: data?.response ?? data };
  }

  async function apiRequest(path, { method = "GET", body, auth } = {}) {
    const authorization = normalizeAuthHeader(auth || authHeader);
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: authorization } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.error || data?.message || res.statusText;
      const err = new Error(message);
      err.status = res.status;
      err.details = data;
      throw err;
    }
    return data?.response ?? data;
  }

  async function authenticateUser({ userName, password }) {
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

  async function getSelfProfileWithToken(token) {
    if (!token) throw new Error("User token is required");
    return apiRequest("/api/2.0/people/@self", { auth: token });
  }

  async function apiRequestForm(path, { method = "POST", body, auth } = {}) {
    const authorization = normalizeAuthHeader(auth || authHeader);
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(authorization ? { Authorization: authorization } : {})
      },
      body
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.error || data?.message || res.statusText;
      const err = new Error(message);
      err.status = res.status;
      err.details = data;
      throw err;
    }
    return data?.response ?? data;
  }

  async function getRooms(auth) {
    const res = await apiRequest("/api/2.0/files/rooms", { auth });
    // DocSpace returns a "rooms folder" object where rooms are exposed in `folders`.
    const rooms = res?.folders || res?.rooms || res?.items || [];
    return Array.isArray(rooms) ? rooms : [];
  }

  async function getFolderContents(folderId, auth) {
    const fid = String(folderId || "").trim();
    if (!fid) throw new Error("folderId is required");
    const content = await apiRequest(`/api/2.0/files/${encodeURIComponent(fid)}`, { auth });
    const files = (content?.files || []).map((f) => ({
      type: "file",
      id: String(f.id),
      title: f.title || f.name || "",
      contentType: f.contentType || "",
      contentLength: typeof f.contentLength === "number" ? f.contentLength : null
    }));
    const folders = (content?.folders || []).map((f) => ({
      type: "folder",
      id: String(f.id),
      title: f.title || f.name || ""
    }));
    return {
      id: String(content?.id || fid),
      title: content?.title || content?.name || "Folder",
      items: [...folders, ...files]
    };
  }

  async function getFileInfo(fileId, auth) {
    const fid = String(fileId || "").trim();
    if (!fid) throw new Error("fileId is required");
    return apiRequest(`/api/2.0/files/file/${encodeURIComponent(fid)}`, { auth });
  }

  async function createRoom({ title }) {
    if (!title) throw new Error("title is required");
    return apiRequest("/api/2.0/files/rooms", {
      method: "POST",
      body: { title }
    });
  }

  async function createFolder({ parentId, title }) {
    if (!parentId || !title) throw new Error("parentId and title are required");
    return apiRequest(`/api/2.0/files/folder/${encodeURIComponent(String(parentId))}`, {
      method: "POST",
      body: { title }
    });
  }

  async function createEmptyDoc({ folderId, title }) {
    if (!folderId || !title) throw new Error("folderId and title are required");
    return apiRequest(`/api/2.0/files/${encodeURIComponent(String(folderId))}/file`, {
      method: "POST",
      body: { title }
    });
  }

  async function moveFileToFolder({ fileId, destFolderId }) {
    if (!fileId || !destFolderId) throw new Error("fileId and destFolderId are required");
    return apiRequest("/api/2.0/files/fileops/move", {
      method: "PUT",
      body: {
        fileIds: [String(fileId)],
        destFolderId: String(destFolderId),
        deleteAfter: true,
        content: true
      }
    });
  }

  async function uploadFileToFolder({ folderId, fileName, buffer, contentType = "application/octet-stream" }) {
    if (!folderId || !fileName || !buffer) throw new Error("folderId, fileName and buffer are required");

    const form = new FormData();
    const blob = new Blob([buffer], { type: contentType || "application/octet-stream" });
    form.append("file", blob, fileName);

    return apiRequestForm(`/api/2.0/files/${encodeURIComponent(String(folderId))}/upload`, {
      method: "POST",
      body: form
    });
  }

  async function getFilePresignedUri(fileId, auth) {
    const fid = String(fileId || "").trim();
    if (!fid) throw new Error("fileId is required");
    const res = await apiRequestRaw(`/api/2.0/files/file/${encodeURIComponent(fid)}/presigneduri`, { auth });
    const data = res?.data;
    if (typeof data === "string" && data.trim().startsWith("http")) return data.trim();
    const url =
      data?.uri ||
      data?.url ||
      data?.presignedUri ||
      data?.presigneduri ||
      data?.downloadUrl ||
      data?.link ||
      null;
    if (url) return String(url);
    // Some deployments may return the URL in raw text even when JSON parsing fails.
    const raw = String(res?.raw || "").trim();
    if (raw.startsWith("http")) return raw;
    throw new Error("Unable to get presigned uri for file");
  }

  async function downloadFileDirectBuffer(fileId, auth) {
    const fid = String(fileId || "").trim();
    if (!fid) throw new Error("fileId is required");

    const authorization = normalizeAuthHeader(auth || authHeader);
    const res = await fetch(`${baseUrl}/api/2.0/files/file/${encodeURIComponent(fid)}/download`, {
      method: "GET",
      headers: authorization ? { Authorization: authorization } : {},
      redirect: "follow"
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Download failed: ${res.status} ${res.statusText}`);
      err.status = res.status;
      err.details = text;
      throw err;
    }

    const ct = String(res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      const text = await res.text().catch(() => "");
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }
      const payload = data?.response ?? data;
      const url = payload?.uri || payload?.url || payload?.downloadUrl || payload?.link || null;
      if (url) {
        const res2 = await fetch(String(url), { redirect: "follow" });
        if (!res2.ok) {
          const t2 = await res2.text().catch(() => "");
          const err2 = new Error(`Download failed: ${res2.status} ${res2.statusText}`);
          err2.status = res2.status;
          err2.details = t2;
          throw err2;
        }
        const ab2 = await res2.arrayBuffer();
        return Buffer.from(ab2);
      }
      const err = new Error("Download endpoint returned JSON but no URL");
      err.status = 500;
      err.details = payload;
      throw err;
    }

    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  function toAbsoluteUrl(uri) {
    const u = String(uri || "").trim();
    if (!u) return "";
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    if (u.startsWith("/")) return `${baseUrl}${u}`;
    return u;
  }

  async function downloadFileBuffer(fileId, auth) {
    const uriError = { message: "", status: null };
    try {
      const uri = await getFilePresignedUri(fileId, auth);
      const authorization = normalizeAuthHeader(auth || authHeader);
      const res = await fetch(toAbsoluteUrl(uri), {
        redirect: "follow",
        headers: authorization ? { Authorization: authorization } : {}
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`Presigned download failed: ${res.status} ${res.statusText}`);
        err.status = res.status;
        err.details = text;
        throw err;
      }

      const ct = String(res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) {
        const text = await res.text().catch(() => "");
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { raw: text };
        }
        const payload = data?.response ?? data;
        const url = payload?.uri || payload?.url || payload?.downloadUrl || payload?.link || null;
        if (url) {
          const res2 = await fetch(toAbsoluteUrl(String(url)), {
            redirect: "follow",
            headers: authorization ? { Authorization: authorization } : {}
          });
          if (!res2.ok) {
            const t2 = await res2.text().catch(() => "");
            const err2 = new Error(`Presigned download failed: ${res2.status} ${res2.statusText}`);
            err2.status = res2.status;
            err2.details = t2;
            throw err2;
          }
          const ab2 = await res2.arrayBuffer();
          return Buffer.from(ab2);
        }
        const err = new Error("Presigned download returned JSON but no URL");
        err.status = 500;
        err.details = payload;
        throw err;
      }
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    } catch (e) {
      uriError.message = e?.message || String(e);
      uriError.status = e?.status || null;
    }

    try {
      return await downloadFileDirectBuffer(fileId, auth);
    } catch (e2) {
      const err = new Error(
        `Unable to download file. Presigned: ${uriError.message || "n/a"}; Direct: ${e2?.message || String(e2)}`
      );
      err.status = e2?.status || uriError.status || 500;
      err.details = { presigned: uriError, direct: e2?.details || null };
      throw err;
    }
  }

  return {
    apiRequest,
    apiRequestRaw,
    authenticateUser,
    getSelfProfileWithToken,
    getRooms,
    getFolderContents,
    getFileInfo,
    createRoom,
    createFolder,
    createEmptyDoc,
    moveFileToFolder,
    uploadFileToFolder,
    downloadFileBuffer
  };
}
