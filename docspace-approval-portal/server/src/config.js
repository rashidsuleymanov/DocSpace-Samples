const baseUrl = process.env.DOCSPACE_BASE_URL || "";
const rawAuthToken =
  process.env.DOCSPACE_AUTHORIZATION ||
  process.env.DOCSPACE_AUTH_TOKEN ||
  process.env.DOCSPACE_API_KEY ||
  "";
const formsRoomTitle = process.env.DOCSPACE_FORMS_ROOM_TITLE || "Forms Room";
const formsRoomTitleFallbacks = (process.env.DOCSPACE_FORMS_ROOM_TITLE_FALLBACKS || "Medical Room,Medical Forms")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const formsTemplatesFolderTitle = process.env.DOCSPACE_FORMS_TEMPLATES_FOLDER_TITLE || "Templates";

export const config = {
  baseUrl,
  rawAuthToken,
  formsRoomTitle,
  formsRoomTitleFallbacks,
  formsTemplatesFolderTitle
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

