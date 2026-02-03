const baseUrl = process.env.DOCSPACE_BASE_URL || "";
const rawAuthToken =
  process.env.DOCSPACE_AUTHORIZATION ||
  process.env.DOCSPACE_AUTH_TOKEN ||
  process.env.DOCSPACE_API_KEY ||
  "";
const doctorEmail = process.env.DOCSPACE_DOCTOR_EMAIL || "";
const doctorAccess = process.env.DOCSPACE_DOCTOR_ACCESS || "RoomManager";
const patientAccess = process.env.DOCSPACE_PATIENT_ACCESS || "Read";
const formsRoomTitle = process.env.DOCSPACE_FORMS_ROOM_TITLE || "Medical Room";
const formsRoomTitleFallbacks = (process.env.DOCSPACE_FORMS_ROOM_TITLE_FALLBACKS || "Medical Forms")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const formsTemplatesFolderTitle = process.env.DOCSPACE_FORMS_TEMPLATES_FOLDER_TITLE || "Templates";
const labRoomTitle = process.env.DOCSPACE_LAB_ROOM_TITLE || "Lab Results";
const labRoomTitleFallbacks = (process.env.DOCSPACE_LAB_ROOM_TITLE_FALLBACKS || "Labs Results")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const medicalRecordTemplateId = process.env.DOCSPACE_MEDICAL_RECORD_TEMPLATE_ID || "3174060";
const autoFillSignTemplateId = process.env.DOCSPACE_AUTO_FILL_SIGN_TEMPLATE_ID || "3174323";
const ticketTemplateId = process.env.DOCSPACE_TEMPLATE_TICKET_ID || "";
const templateContractId = process.env.DOCSPACE_TEMPLATE_CONTRACT_ID || "";
const templateWelcomeId = process.env.DOCSPACE_TEMPLATE_WELCOME_ID || "";

export const config = {
  baseUrl,
  rawAuthToken,
  doctorEmail,
  doctorAccess,
  patientAccess,
  formsRoomTitle,
  formsRoomTitleFallbacks,
  formsTemplatesFolderTitle,
  labRoomTitle,
  labRoomTitleFallbacks,
  medicalRecordTemplateId,
  autoFillSignTemplateId,
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
