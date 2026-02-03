const appointments = [];
const medicalRecords = [];
const fillSignAssignments = [];
// In-memory mapping (sample app). Lets server resolve a patient room -> patient userId.
const patientRoomByUserId = new Map();
const patientUserByRoomId = new Map();

function safeDate(value) {
  return String(value || "").slice(0, 10);
}

export function recordAppointment({ roomId, roomTitle, patientName, appointment, ticket }) {
  if (!roomId || !appointment?.id) return null;
  const existingIndex = appointments.findIndex((item) => item.id === appointment.id);
  const entry = {
    id: appointment.id,
    roomId,
    roomTitle: roomTitle || "Patient Room",
    patientName: patientName || "Patient",
    date: safeDate(appointment.date || appointment.dateTime || appointment.datetime),
    time: appointment.time || "",
    doctor: appointment.doctor || "",
    reason: appointment.reason || "",
    status: appointment.status || "Scheduled",
    ticket: ticket || null,
    createdAt: new Date().toISOString()
  };
  if (existingIndex >= 0) {
    appointments[existingIndex] = { ...appointments[existingIndex], ...entry };
    return appointments[existingIndex];
  }
  appointments.push(entry);
  return entry;
}

export function listAppointments({ date } = {}) {
  const targetDate = safeDate(date);
  const items = targetDate
    ? appointments.filter((item) => safeDate(item.date) === targetDate)
    : appointments;
  return [...items].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export function recordMedicalRecord(record) {
  if (!record?.id || !record?.roomId) return null;
  const normalized = { ...record, roomId: String(record.roomId) };
  const index = medicalRecords.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    medicalRecords[index] = { ...medicalRecords[index], ...normalized };
    return medicalRecords[index];
  }
  medicalRecords.push({ ...normalized, createdAt: new Date().toISOString() });
  return normalized;
}

export function listMedicalRecords(roomId) {
  const target = roomId ? String(roomId) : "";
  const items = target
    ? medicalRecords.filter((item) => String(item.roomId) === target)
    : medicalRecords;
  return [...items].sort((a, b) => `${b.date || ""}`.localeCompare(a.date || ""));
}

export function closeAppointment(appointmentId) {
  if (!appointmentId) return null;
  const index = appointments.findIndex((item) => item.id === appointmentId);
  if (index < 0) return null;
  appointments[index] = { ...appointments[index], status: "Closed" };
  return appointments[index];
}

export function recordPatientMapping({ userId, roomId, patientName }) {
  const uid = String(userId || "").trim();
  const rid = String(roomId || "").trim();
  if (!uid || !rid) return null;
  const entry = { userId: uid, roomId: rid, patientName: patientName || null };
  patientRoomByUserId.set(uid, entry);
  patientUserByRoomId.set(rid, entry);
  return entry;
}

export function getPatientIdByRoomId(roomId) {
  const rid = String(roomId || "").trim();
  return rid ? patientUserByRoomId.get(rid)?.userId || null : null;
}

export function getPatientRoomIdByUserId(userId) {
  const uid = String(userId || "").trim();
  return uid ? patientRoomByUserId.get(uid)?.roomId || null : null;
}

export function recordFillSignAssignment({
  assignmentId,
  patientRoomId,
  patientId,
  patientName,
  templateFileId,
  templateTitle,
  requestedBy,
  medicalRoomId,
  shareLink,
  shareToken
} = {}) {
  const rid = String(patientRoomId || "").trim();
  const fid = String(templateFileId || "").trim();
  const pid = patientId ? String(patientId).trim() : "";
  const aid = String(assignmentId || "").trim();
  if (!rid || !fid) return null;
  if (!aid) return null;
  const entry = {
    id: aid,
    patientRoomId: rid,
    patientId: pid || null,
    patientName: patientName ? String(patientName) : null,
    templateFileId: fid,
    templateTitle: templateTitle ? String(templateTitle) : null,
    medicalRoomId: medicalRoomId ? String(medicalRoomId) : null,
    requestedBy: requestedBy ? String(requestedBy) : null,
    shareLink: shareLink ? String(shareLink) : null,
    shareToken: shareToken ? String(shareToken) : null,
    createdAt: new Date().toISOString()
  };
  fillSignAssignments.push(entry);
  return entry;
}

export function listFillSignAssignmentsForRoom(patientRoomId) {
  const rid = String(patientRoomId || "").trim();
  if (!rid) return [];
  return fillSignAssignments
    .filter((item) => item.patientRoomId === rid)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function hasFillSignAssignmentForRoomTemplate({ patientRoomId, templateFileId } = {}) {
  const rid = String(patientRoomId || "").trim();
  const tid = String(templateFileId || "").trim();
  if (!rid || !tid) return false;
  return fillSignAssignments.some(
    (item) => item.patientRoomId === rid && String(item.templateFileId || "") === tid
  );
}

export function listFillSignAssignmentsForPatient(patientId) {
  const pid = String(patientId || "").trim();
  if (!pid) return [];
  return fillSignAssignments
    .filter((item) => item.patientId === pid)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function removeFillSignAssignment({ patientRoomId, fileId } = {}) {
  const rid = String(patientRoomId || "").trim();
  const id = String(fileId || "").trim();
  if (!rid || !id) return false;
  const idx = fillSignAssignments.findIndex((item) => item.id === id && item.patientRoomId === rid);
  if (idx < 0) return false;
  fillSignAssignments.splice(idx, 1);
  return true;
}

