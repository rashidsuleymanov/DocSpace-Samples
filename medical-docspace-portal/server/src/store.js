const appointments = [];
const medicalRecords = [];

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
  const index = medicalRecords.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    medicalRecords[index] = { ...medicalRecords[index], ...record };
    return medicalRecords[index];
  }
  medicalRecords.push({ ...record, createdAt: new Date().toISOString() });
  return record;
}

export function listMedicalRecords(roomId) {
  const items = roomId ? medicalRecords.filter((item) => item.roomId === roomId) : medicalRecords;
  return [...items].sort((a, b) => `${b.date || ""}`.localeCompare(a.date || ""));
}

export function closeAppointment(appointmentId) {
  if (!appointmentId) return null;
  const index = appointments.findIndex((item) => item.id === appointmentId);
  if (index < 0) return null;
  appointments[index] = { ...appointments[index], status: "Closed" };
  return appointments[index];
}

