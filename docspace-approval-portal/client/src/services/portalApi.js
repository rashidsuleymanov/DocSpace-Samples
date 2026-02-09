function toErrorMessage(data, fallback) {
  const details =
    typeof data?.details === "string"
      ? data.details
      : typeof data?.details?.hint === "string"
        ? data.details.hint
        : typeof data?.details?.message === "string"
          ? data.details.message
          : data?.details
            ? JSON.stringify(data.details)
            : "";
  const message = data?.error || fallback;
  return details ? `${message}: ${details}` : message;
}

export async function login({ email, password }) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, "DocSpace login failed"));
  }
  return {
    token: data?.token || null,
    user: data?.user || null,
    formsRoom: data?.formsRoom || null
  };
}

export async function register({ firstName, lastName, email, password }) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ firstName, lastName, email, password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, "Registration failed"));
  }
  return {
    token: data?.token || null,
    user: data?.user || null
  };
}

export async function listTemplates({ token }) {
  const response = await fetch("/api/templates", {
    headers: { Authorization: token }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Forms load failed (${response.status})`));
  }
  return data;
}

export async function listDrafts({ token }) {
  const response = await fetch("/api/drafts", {
    headers: { Authorization: token }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Drafts load failed (${response.status})`));
  }
  return data;
}

export async function createDraft({ token, title }) {
  const response = await fetch("/api/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ title })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Draft create failed (${response.status})`));
  }
  return data;
}

export async function publishDraft({ token, fileId, projectId, activate = true }) {
  const response = await fetch("/api/drafts/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ fileId, projectId, activate })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Publish failed (${response.status})`));
  }
  if (data?.ok && data?.createdFile === null) {
    data.warning =
      data.warning ||
      "Copy finished, but the created file was not detected. Check the project room Templates (and In Process) folders.";
  }
  return data;
}

export async function listFlows({ token }) {
  if (!String(token || "").trim()) throw new Error("Authorization token is required");
  const response = await fetch("/api/flows", { headers: { Authorization: token } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Flows load failed (${response.status})`));
  }
  return data;
}

export async function createFlowFromTemplate({ token, templateFileId }) {
  const response = await fetch("/api/flows/from-template", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ templateFileId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Flow creation failed (${response.status})`));
  }
  return data;
}

export async function settingsStatus({ roomTitle, roomId } = {}) {
  const params = new URLSearchParams();
  if (roomId) params.set("roomId", String(roomId));
  if (roomTitle) params.set("roomTitle", String(roomTitle));
  const qs = params.toString();
  const response = await fetch(`/api/settings/status${qs ? `?${qs}` : ""}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Settings status failed (${response.status})`));
  }
  return data;
}

export async function settingsBootstrap(payload) {
  const response = await fetch("/api/settings/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Settings bootstrap failed (${response.status})`));
  }
  return data;
}

export async function getSettingsConfig() {
  const response = await fetch("/api/settings/config");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Config load failed (${response.status})`));
  }
  return data;
}

export async function updateSettingsConfig(patch) {
  const response = await fetch("/api/settings/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Config save failed (${response.status})`));
  }
  return data;
}

export async function testSettingsConfig() {
  const response = await fetch("/api/settings/config/test", { method: "POST" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Config test failed (${response.status})`));
  }
  return data;
}

export async function listSettingsRooms({ roomType = 1 } = {}) {
  const query = roomType !== undefined && roomType !== null ? `?roomType=${encodeURIComponent(String(roomType))}` : "";
  const response = await fetch(`/api/settings/rooms${query}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Rooms load failed (${response.status})`));
  }
  return data;
}

export async function createSettingsRoom({ title, roomType = 1, select = true } = {}) {
  const response = await fetch("/api/settings/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, roomType, select })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Room creation failed (${response.status})`));
  }
  return data;
}

export async function listProjects() {
  throw new Error("Use getProjectsSidebar({ token })");
}

export async function getProjectsSidebar({ token }) {
  if (!String(token || "").trim()) throw new Error("Authorization token is required");
  const response = await fetch("/api/projects/sidebar", { headers: { Authorization: token } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(toErrorMessage(data, `Projects load failed (${response.status})`));
  return data;
}

export async function createProject({ token, title }) {
  if (!String(token || "").trim()) throw new Error("Authorization token is required");
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ title })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(toErrorMessage(data, `Project creation failed (${response.status})`));
  return data;
}

export async function activateProject(projectId) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/activate`, { method: "POST" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(toErrorMessage(data, `Project activate failed (${response.status})`));
  return data;
}

export async function getActiveProject() {
  throw new Error("Use getProjectsSidebar({ token })");
}

export async function inviteProject({ token, projectId, emails, access, notify, message }) {
  if (!String(token || "").trim()) throw new Error("Authorization token is required");
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ emails, access, notify, message })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(toErrorMessage(data, `Invite failed (${response.status})`));
  return data;
}

export async function deleteProject({ token, projectId }) {
  if (!String(token || "").trim()) throw new Error("Authorization token is required");
  const pid = String(projectId || "").trim();
  if (!pid) throw new Error("projectId is required");
  const response = await fetch(`/api/projects/${encodeURIComponent(pid)}`, { method: "DELETE", headers: { Authorization: token } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(toErrorMessage(data, `Delete failed (${response.status})`));
  return data;
}

export async function getProjectsPermissions({ token }) {
  if (!String(token || "").trim()) throw new Error("Authorization token is required");
  const response = await fetch("/api/projects/permissions", { headers: { Authorization: token } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(toErrorMessage(data, `Permissions load failed (${response.status})`));
  return data;
}

export async function getProjectMembers({ token, projectId }) {
  const pid = String(projectId || "").trim();
  if (!pid) throw new Error("projectId is required");
  if (!String(token || "").trim()) throw new Error("Authorization token is required");
  const response = await fetch(`/api/projects/${encodeURIComponent(pid)}/members`, { headers: { Authorization: token } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(toErrorMessage(data, `Members load failed (${response.status})`));
  return data;
}

export async function removeProjectMember({ token, projectId, userId }) {
  const t = String(token || "").trim();
  if (!t) throw new Error("Authorization token is required");
  const pid = String(projectId || "").trim();
  const uid = String(userId || "").trim();
  if (!pid) throw new Error("projectId is required");
  if (!uid) throw new Error("userId is required");
  const response = await fetch(`/api/projects/${encodeURIComponent(pid)}/members/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: t }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(toErrorMessage(data, `Remove member failed (${response.status})`));
  return data;
}

export async function getLibraryStatus() {
  const response = await fetch("/api/library/status");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(toErrorMessage(data, `Library status failed (${response.status})`));
  return data;
}

export async function createLibraryRoom({ title }) {
  const response = await fetch("/api/library/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(toErrorMessage(data, `Library room create failed (${response.status})`));
  return data;
}

export async function listLibraryFiles() {
  const response = await fetch("/api/library/files");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(toErrorMessage(data, `Library files load failed (${response.status})`));
  return data;
}

export async function createLibraryFile({ title, type = "text" } = {}) {
  const response = await fetch("/api/library/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, type })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(toErrorMessage(data, `Library file create failed (${response.status})`));
  return data;
}

export async function publishLibraryFile({ token, fileId, targetRoomId }) {
  if (!String(token || "").trim()) throw new Error("Authorization token is required");
  const response = await fetch("/api/library/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ fileId, targetRoomId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(toErrorMessage(data, `Publish failed (${response.status})`));
  return data;
}
