async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || `Request failed (${response.status})`;
    const error = new Error(message);
    error.details = data?.details || null;
    throw error;
  }
  return data;
}

export async function getDoctorSession() {
  const data = await request("/api/doctor/session");
  return data.doctor;
}

export async function getDoctorRooms() {
  const data = await request("/api/doctor/rooms");
  return data.rooms || [];
}

export async function getDoctorRoomSummary(roomId) {
  const data = await request(`/api/doctor/rooms/${roomId}/summary`);
  return data.summary || [];
}

export async function getDoctorAppointments(date) {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  const data = await request(`/api/doctor/appointments${query}`);
  return data.appointments || [];
}

export async function createLabResult(roomId, payload) {
  const data = await request(`/api/doctor/rooms/${roomId}/lab-result`, {
    method: "POST",
    body: payload
  });
  return data.file || null;
}

export async function createPrescription(roomId, payload) {
  const data = await request(`/api/doctor/rooms/${roomId}/prescription`, {
    method: "POST",
    body: payload
  });
  return data;
}

export async function createMedicalRecord(roomId, payload) {
  const data = await request(`/api/doctor/rooms/${roomId}/medical-record`, {
    method: "POST",
    body: payload
  });
  return data.file || null;
}

export async function createRoomDocument(roomId, payload) {
  const data = await request(`/api/doctor/rooms/${roomId}/documents`, {
    method: "POST",
    body: payload
  });
  return data.file || null;
}

export async function getDoctorFolderContents(roomId, title) {
  const query = `?title=${encodeURIComponent(title)}`;
  const data = await request(`/api/doctor/rooms/${roomId}/folder-contents${query}`);
  return data.contents || { items: [] };
}

export async function getDoctorFolderContentsById(folderId) {
  const data = await request(`/api/doctor/folders/${encodeURIComponent(folderId)}/contents`);
  return data.contents || { items: [] };
}

export async function getDoctorFillSignContents(roomId, tab) {
  const query = tab ? `?tab=${encodeURIComponent(tab)}` : "";
  const data = await request(`/api/doctor/rooms/${roomId}/fill-sign/contents${query}`);
  return data.contents || { items: [] };
}

export async function cancelDoctorFillSignRequest(roomId, assignmentId) {
  const rid = String(roomId || "").trim();
  const aid = String(assignmentId || "").trim();
  if (!rid) throw new Error("roomId is required");
  if (!aid) throw new Error("assignmentId is required");
  const data = await request(`/api/doctor/rooms/${rid}/fill-sign/cancel`, {
    method: "POST",
    body: { assignmentId: aid }
  });
  return Boolean(data?.ok);
}

export async function getDoctorIncomingFillSign(tab) {
  const query = tab ? `?tab=${encodeURIComponent(tab)}` : "";
  const data = await request(`/api/doctor/fill-sign/incoming${query}`);
  return {
    contents: data.contents || { items: [] },
    counts: data.counts || { action: 0, completed: 0 }
  };
}

export async function copyLabResultFromDocSpace(roomId, payload) {
  const data = await request(`/api/doctor/rooms/${roomId}/lab-result/copy`, {
    method: "POST",
    body: payload
  });
  return data.file || null;
}

export async function listTemplateFiles() {
  const data = await request("/api/doctor/templates/files");
  return {
    room: data.room || null,
    files: data.files || []
  };
}

export async function listLabFiles() {
  const data = await request("/api/doctor/lab/files");
  return {
    room: data.room || null,
    files: data.files || []
  };
}

export async function requestFillSign(roomId, payload) {
  const data = await request(`/api/doctor/rooms/${roomId}/fill-sign/request`, {
    method: "POST",
    body: payload
  });
  return data.files || [];
}

export async function uploadImagingFile(roomId, payload) {
  const data = await request(`/api/doctor/rooms/${roomId}/imaging/upload`, {
    method: "POST",
    body: payload
  });
  return data;
}

export async function createImagingPackage(roomId, payload) {
  const data = await request(`/api/doctor/rooms/${roomId}/imaging/package`, {
    method: "POST",
    body: payload
  });
  return data;
}

export async function createDoctorFileShareLink(fileId) {
  const fid = String(fileId || "").trim();
  if (!fid) throw new Error("fileId is required");
  const data = await request("/api/doctor/file-share-link", {
    method: "POST",
    body: { fileId: fid }
  });
  return data.link || null;
}
