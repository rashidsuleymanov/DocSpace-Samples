const baseUrl = process.env.DOCSPACE_BASE_URL || "";
const rawAuthToken =
  process.env.DOCSPACE_AUTHORIZATION ||
  process.env.DOCSPACE_AUTH_TOKEN ||
  process.env.DOCSPACE_API_KEY ||
  "";
const officerEmail =
  process.env.DOCSPACE_MANAGER_EMAIL ||
  process.env.DOCSPACE_OFFICER_EMAIL ||
  process.env.DOCSPACE_DOCTOR_EMAIL ||
  "";
const officerAccess =
  process.env.DOCSPACE_MANAGER_ACCESS ||
  process.env.DOCSPACE_OFFICER_ACCESS ||
  process.env.DOCSPACE_DOCTOR_ACCESS ||
  "RoomManager";
const patientAccess =
  process.env.DOCSPACE_CLIENT_ACCESS ||
  process.env.DOCSPACE_PATIENT_ACCESS ||
  "Editing";
const demoEmailDomain = process.env.DEMO_EMAIL_DOMAIN || "demo.local";
const managerTitle = process.env.DOCSPACE_MANAGER_TITLE || "Account Director";

export const config = {
  baseUrl,
  rawAuthToken,
  officerEmail,
  officerAccess,
  patientAccess,
  demoEmailDomain,
  managerTitle
};

export function validateConfig({ requiresAuth = true } = {}) {
  const errors = [];
  if (!baseUrl) {
    errors.push("DOCSPACE_BASE_URL is not set");
  }
  if (requiresAuth && !rawAuthToken) {
    errors.push("DOCSPACE_AUTH_TOKEN (or DOCSPACE_AUTHORIZATION) is not set");
  }
  return errors;
}
