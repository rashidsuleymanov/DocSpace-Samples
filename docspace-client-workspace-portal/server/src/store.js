import { randomUUID } from "node:crypto";

const applications = [];
const requests = [];

export const applicationTypes = [
  {
    key: "client-onboarding",
    title: "Client Onboarding",
    description: "Kick off a new client workspace with onboarding documents and access requests.",
    fields: [
      { key: "companyName", label: "Company name", type: "text", required: true },
      { key: "contactName", label: "Primary contact", type: "text", required: true },
      { key: "department", label: "Department or business unit", type: "text", required: false },
      { key: "launchDate", label: "Target launch date", type: "date", required: false },
      { key: "notes", label: "Kickoff notes", type: "text", required: false }
    ],
    requiredDocuments: [
      "Signed NDA",
      "Brand guidelines",
      "Primary contact list"
    ],
    formDocuments: ["Kickoff checklist", "Workspace welcome note"]
  },
  {
    key: "proposal-review",
    title: "Proposal Review",
    description: "Collect documents and feedback for a commercial proposal or renewal package.",
    fields: [
      { key: "companyName", label: "Company name", type: "text", required: true },
      { key: "dealOwner", label: "Deal owner", type: "text", required: true },
      { key: "budgetRange", label: "Budget range", type: "text", required: false },
      { key: "decisionDate", label: "Decision deadline", type: "date", required: false },
      { key: "summary", label: "Commercial summary", type: "text", required: true }
    ],
    requiredDocuments: [
      "Proposal PDF",
      "Procurement checklist",
      "Stakeholder matrix"
    ],
    formDocuments: ["Proposal summary", "Approval cover memo"]
  },
  {
    key: "contract-renewal",
    title: "Contract Renewal",
    description: "Prepare the renewal package, commercial terms, and required legal documents.",
    fields: [
      { key: "companyName", label: "Company name", type: "text", required: true },
      { key: "renewalOwner", label: "Renewal owner", type: "text", required: true },
      { key: "renewalDate", label: "Renewal date", type: "date", required: true },
      { key: "currentTerm", label: "Current term", type: "text", required: false },
      { key: "expansionScope", label: "Expansion scope", type: "text", required: false }
    ],
    requiredDocuments: [
      "Current agreement",
      "Redline comments",
      "Updated billing details"
    ],
    formDocuments: ["Renewal summary", "Client action plan"]
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
    return { ...record, error: "Missing required project files" };
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
  record.status = "Completed";
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
