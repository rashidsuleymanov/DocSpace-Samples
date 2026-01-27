const baseUrl = process.env.DOCSPACE_BASE_URL || "";
const rawAuthToken =
  process.env.DOCSPACE_AUTHORIZATION ||
  process.env.DOCSPACE_AUTH_TOKEN ||
  process.env.DOCSPACE_API_KEY ||
  "";
const doctorEmail = process.env.DOCSPACE_DOCTOR_EMAIL || "";
const doctorAccess = process.env.DOCSPACE_DOCTOR_ACCESS || "RoomManager";
const patientAccess = process.env.DOCSPACE_PATIENT_ACCESS || "Read";
const ticketTemplateId = process.env.DOCSPACE_TEMPLATE_TICKET_ID || "";
const templateContractId = process.env.DOCSPACE_TEMPLATE_CONTRACT_ID || "";
const templateWelcomeId = process.env.DOCSPACE_TEMPLATE_WELCOME_ID || "";

export const config = {
  baseUrl,
  rawAuthToken,
  doctorEmail,
  doctorAccess,
  patientAccess,
  ticketTemplateId,
  templateContractId,
  templateWelcomeId
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
