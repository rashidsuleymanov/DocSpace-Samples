export function getLocalDateInputValue() {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

export function getDoctorTopbarProps({ view, selectedRoom, dateFilter, onDateFilter }) {
  if (view === "doctor-schedule") {
    return {
      title: "Doctor schedule",
      subtitle: "All appointments for the selected date.",
      dateFilter,
      onDateFilter
    };
  }
  if (view === "doctor-patients") {
    return {
      title: "Patients",
      subtitle: "Browse patient rooms."
    };
  }
  if (view === "doctor-fill-sign") {
    return {
      title: "Fill & Sign",
      subtitle: "Manage patient signature requests."
    };
  }
  if (view === "doctor-inbox") {
    return {
      title: "Incoming statements",
      subtitle: "Statements started by patients."
    };
  }
  return {
    title: selectedRoom ? selectedRoom.patientName : "Patient",
    subtitle: selectedRoom ? selectedRoom.title : "Select a patient room"
  };
}

export function buildPrescriptionPayload({ payload, patient, doctor }) {
  const data = payload || {};
  return {
    type: "prescription",
    date: data.date || "-",
    doctor: doctor?.displayName || "Doctor",
    patient: patient?.patientName || "Patient",
    medication: data.medication || "-",
    dosage: data.dosage || "-",
    instructions: data.instructions || "-"
  };
}

export function buildMedicalRecordPayload({ record, appointment, patient, doctor }) {
  return {
    type: "medical-record",
    date: record?.date || "-",
    recordType: record?.type || "Visit note",
    doctor: doctor?.displayName || "Doctor",
    patient: patient?.patientName || "Patient",
    appointment: appointment
      ? `${appointment.date || ""} ${appointment.time || ""}`.trim()
      : "-",
    summary: record?.description || "-"
  };
}

