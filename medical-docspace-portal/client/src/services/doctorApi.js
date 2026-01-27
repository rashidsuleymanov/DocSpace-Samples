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
  return data.record || null;
}

export async function getDoctorFolderContents(roomId, title) {
  const query = `?title=${encodeURIComponent(title)}`;
  const data = await request(`/api/doctor/rooms/${roomId}/folder-contents${query}`);
  return data.contents || { items: [] };
}

export async function copyLabResultFromDocSpace(roomId, payload) {
  const data = await request(`/api/doctor/rooms/${roomId}/lab-result/copy`, {
    method: "POST",
    body: payload
  });
  return data.file || null;
}
