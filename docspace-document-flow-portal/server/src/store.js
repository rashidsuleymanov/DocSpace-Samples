import { randomUUID } from "node:crypto";

const applications = [];
const requests = [];

export const applicationTypes = [
  {
    key: "residence-permit",
    title: "Residence Permit (Aufenthaltstitel)",
    description: "First-time residence permit application.",
    fields: [
      { key: "fullName", label: "Full name (as in passport)", type: "text", required: true },
      { key: "nationality", label: "Nationality", type: "text", required: true },
      { key: "passportNumber", label: "Passport number", type: "text", required: true },
      { key: "address", label: "German address", type: "text", required: true },
      { key: "reason", label: "Reason for stay", type: "text", required: true },
      { key: "employer", label: "Employer or university", type: "text", required: false }
    ],
    requiredDocuments: [
      "Passport scan",
      "Biometric photo",
      "Lease contract",
      "Proof of income"
    ],
    formDocuments: ["Application form", "Consent to data processing"]
  },
  {
    key: "child-benefit",
    title: "Child Benefit (Kindergeld)",
    description: "Monthly benefit application for children.",
    fields: [
      { key: "guardianName", label: "Guardian full name", type: "text", required: true },
      { key: "childName", label: "Child full name", type: "text", required: true },
      { key: "childBirthDate", label: "Child birth date", type: "date", required: true },
      { key: "familyStatus", label: "Family status", type: "text", required: false },
      { key: "iban", label: "IBAN for payments", type: "text", required: true }
    ],
    requiredDocuments: [
      "Birth certificate",
      "Registration certificate (Meldebescheinigung)",
      "Parents ID scans"
    ],
    formDocuments: ["Benefit application form", "Family status declaration"]
  },
  {
    key: "vehicle-registration",
    title: "Vehicle Registration (Kfz-Zulassung)",
    description: "Register a vehicle in Germany.",
    fields: [
      { key: "ownerName", label: "Owner full name", type: "text", required: true },
      { key: "vehicleId", label: "Vehicle identification number (VIN)", type: "text", required: true },
      { key: "insurance", label: "Insurance number (eVB)", type: "text", required: true },
      { key: "registrationOffice", label: "Registration office city", type: "text", required: true }
    ],
    requiredDocuments: [
      "Passport/ID scan",
      "Vehicle title (Zulassungsbescheinigung Teil II)",
      "Proof of insurance (eVB)"
    ],
    formDocuments: ["Registration request", "SEPA direct debit mandate"]
  }
];

export function getApplicationType(key) {
  return applicationTypes.find((item) => item.key === key) || null;
}

export function createApplicationRecord(payload) {
  const now = new Date().toISOString();
  const record = {
    id: randomUUID(),
    status: "Draft",
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    uploads: {},
    roomId: payload?.roomId ? String(payload.roomId) : "",
    ...payload
  };
  applications.push(record);
  return record;
}

export function listApplications({ roomId, status } = {}) {
  let items = roomId
    ? applications.filter((item) => String(item.roomId) === String(roomId))
    : applications;
  if (status) {
    items = items.filter((item) => item.status === status);
  }
  return [...items].sort((a, b) => `${b.createdAt}`.localeCompare(a.createdAt));
}

export function getApplicationById(id) {
  return applications.find((item) => item.id === id) || null;
}

export function addApplicationUpload({ applicationId, requiredKey, file }) {
  const record = getApplicationById(applicationId);
  if (!record) return null;
  const key = requiredKey || "Other";
  if (!record.uploads[key]) {
    record.uploads[key] = [];
  }
  if (file) {
    record.uploads[key].push(file);
  }
  record.updatedAt = new Date().toISOString();
  return record;
}

export function isApplicationReady(record) {
  if (!record) return false;
  return (record.requiredDocuments || []).every(
    (doc) => (record.uploads?.[doc] || []).length > 0
  );
}

export function submitApplication(applicationId) {
  const record = getApplicationById(applicationId);
  if (!record) return null;
  if (!isApplicationReady(record)) {
    return { ...record, error: "Missing required documents" };
  }
  if (record.status !== "Submitted") {
    record.status = "Submitted";
    record.submittedAt = new Date().toISOString();
    record.updatedAt = new Date().toISOString();
  }
  return record;
}

export function closeApplication({ applicationId, issuedDocument }) {
  const record = getApplicationById(applicationId);
  if (!record) return null;
  record.status = "Closed";
  record.closedAt = new Date().toISOString();
  record.updatedAt = new Date().toISOString();
  if (issuedDocument) {
    record.issuedDocument = issuedDocument;
  }
  return record;
}

export function listRequests({ roomId } = {}) {
  const items = roomId
    ? requests.filter((item) => String(item.roomId) === String(roomId))
    : requests;
  return [...items].sort((a, b) => `${b.createdAt}`.localeCompare(a.createdAt));
}

export function getRequestById(id) {
  return requests.find((item) => item.id === id) || null;
}

export function createRequestRecord(payload) {
  const now = new Date().toISOString();
  const record = {
    id: randomUUID(),
    status: "Open",
    createdAt: now,
    updatedAt: now,
    uploads: {},
    ...payload
  };
  requests.push(record);
  return record;
}

export function addRequestUpload({ requestId, requiredKey, file }) {
  const record = getRequestById(requestId);
  if (!record) return null;
  const key = requiredKey || "Other";
  if (!record.uploads[key]) {
    record.uploads[key] = [];
  }
  if (file) {
    record.uploads[key].push(file);
  }
  record.updatedAt = new Date().toISOString();
  const allRequired = (record.requiredDocuments || []).every(
    (doc) => (record.uploads?.[doc] || []).length > 0
  );
  if (allRequired) {
    record.status = "Completed";
  }
  return record;
}
