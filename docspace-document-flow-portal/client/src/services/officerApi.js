const officerSessionKey = "docflow.portal.officer";

export async function getOfficerSession() {
  const response = await fetch("/api/officer/session");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Officer session failed");
  }
  const officer = data.officer;
  if (officer) {
    localStorage.setItem(officerSessionKey, JSON.stringify(officer));
  }
  return officer;
}

export async function listOfficerApplications() {
  const response = await fetch("/api/officer/applications");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load applications");
  }
  return data.applications || [];
}

export async function getOfficerApplication(applicationId) {
  const response = await fetch(`/api/officer/applications/${applicationId}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load application");
  }
  return data;
}

export async function issueOfficerDocx(applicationId) {
  const response = await fetch(`/api/officer/applications/${applicationId}/issue-docx`, {
    method: "POST"
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Issue failed");
  }
  return data;
}

// Backwards compatibility for any cached imports during HMR.
export async function issueOfficerText(applicationId) {
  return issueOfficerDocx(applicationId);
}

export async function closeOfficerApplication({ applicationId, issuedDocument }) {
  const response = await fetch(`/api/officer/applications/${applicationId}/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issuedDocument })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Close failed");
  }
  return data.application;
}

export async function createOfficerRequest({
  roomId,
  title,
  periodFrom,
  periodTo,
  requiredDocuments
}) {
  const response = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, title, periodFrom, periodTo, requiredDocuments })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to create request");
  }
  return data.request;
}

export async function listOfficerRequests(roomId) {
  const query = roomId ? `?roomId=${encodeURIComponent(roomId)}` : "";
  const response = await fetch(`/api/requests${query}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load requests");
  }
  return data.requests || [];
}

export function getOfficerSessionFromCache() {
  const raw = localStorage.getItem(officerSessionKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearOfficerSessionCache() {
  localStorage.removeItem(officerSessionKey);
}
