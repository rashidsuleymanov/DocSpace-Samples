import fs from "node:fs/promises";
import path from "node:path";

const configFilePath = path.resolve(process.cwd(), "server/.data/config.json");

function normalizeFallbacks(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v || "").trim()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((v) => String(v || "").trim())
    .filter(Boolean);
}

function envDefaults() {
  const baseUrl = process.env.DOCSPACE_BASE_URL || "";
  const rawAuthToken =
    process.env.DOCSPACE_AUTHORIZATION ||
    process.env.DOCSPACE_AUTH_TOKEN ||
    process.env.DOCSPACE_API_KEY ||
    "";
  const formsRoomId = process.env.DOCSPACE_FORMS_ROOM_ID || "";
  const libraryRoomId = process.env.DOCSPACE_LIBRARY_ROOM_ID || "";
  const formsRoomTitle = process.env.DOCSPACE_FORMS_ROOM_TITLE || "Forms Room";
  const formsRoomTitleFallbacks = normalizeFallbacks(
    process.env.DOCSPACE_FORMS_ROOM_TITLE_FALLBACKS || "Medical Room,Medical Forms"
  );
  const formsTemplatesFolderTitle = process.env.DOCSPACE_FORMS_TEMPLATES_FOLDER_TITLE || "Templates";
  return {
    baseUrl,
    rawAuthToken,
    formsRoomId,
    libraryRoomId,
    formsRoomTitle,
    formsRoomTitleFallbacks,
    formsTemplatesFolderTitle
  };
}

let runtimeConfig = envDefaults();

async function loadConfigFile() {
  try {
    const raw = await fs.readFile(configFilePath, "utf8");
    const data = raw ? JSON.parse(raw) : null;
    if (!data || typeof data !== "object") return;

    runtimeConfig = {
      ...runtimeConfig,
      baseUrl: typeof data.baseUrl === "string" ? data.baseUrl : runtimeConfig.baseUrl,
      rawAuthToken: typeof data.rawAuthToken === "string" ? data.rawAuthToken : runtimeConfig.rawAuthToken,
      formsRoomId: typeof data.formsRoomId === "string" || typeof data.formsRoomId === "number" ? String(data.formsRoomId) : runtimeConfig.formsRoomId,
      libraryRoomId:
        typeof data.libraryRoomId === "string" || typeof data.libraryRoomId === "number"
          ? String(data.libraryRoomId)
          : runtimeConfig.libraryRoomId,
      formsRoomTitle: typeof data.formsRoomTitle === "string" ? data.formsRoomTitle : runtimeConfig.formsRoomTitle,
      formsRoomTitleFallbacks: normalizeFallbacks(data.formsRoomTitleFallbacks) || runtimeConfig.formsRoomTitleFallbacks,
      formsTemplatesFolderTitle:
        typeof data.formsTemplatesFolderTitle === "string"
          ? data.formsTemplatesFolderTitle
          : runtimeConfig.formsTemplatesFolderTitle
    };
  } catch (e) {
    if (e?.code === "ENOENT") return;
    console.warn("[config] failed to load persisted config:", e?.message || e);
  }
}

await loadConfigFile();

export function getConfig() {
  return { ...runtimeConfig, formsRoomTitleFallbacks: [...(runtimeConfig.formsRoomTitleFallbacks || [])] };
}

export async function updateConfig(patch = {}) {
  const next = { ...runtimeConfig };
  if (typeof patch.baseUrl === "string") next.baseUrl = patch.baseUrl.trim();
  if (typeof patch.rawAuthToken === "string") {
    const token = patch.rawAuthToken.trim();
    if (token) next.rawAuthToken = token;
    if (!token && patch.clearAuthToken === true) next.rawAuthToken = "";
  }
  if (patch.formsRoomId !== undefined) {
    const rid = String(patch.formsRoomId || "").trim();
    next.formsRoomId = rid;
  }
  if (patch.libraryRoomId !== undefined) {
    const rid = String(patch.libraryRoomId || "").trim();
    next.libraryRoomId = rid;
  }
  if (typeof patch.formsRoomTitle === "string") next.formsRoomTitle = patch.formsRoomTitle.trim() || next.formsRoomTitle;
  if (patch.formsRoomTitleFallbacks !== undefined) {
    next.formsRoomTitleFallbacks = normalizeFallbacks(patch.formsRoomTitleFallbacks);
  }
  if (typeof patch.formsTemplatesFolderTitle === "string") {
    next.formsTemplatesFolderTitle = patch.formsTemplatesFolderTitle.trim() || next.formsTemplatesFolderTitle;
  }

  runtimeConfig = next;
  await persistConfig();
  return getConfig();
}

export async function persistConfig() {
  try {
    await fs.mkdir(path.dirname(configFilePath), { recursive: true });
    await fs.writeFile(configFilePath, JSON.stringify(runtimeConfig, null, 2), "utf8");
  } catch (e) {
    console.warn("[config] failed to persist config:", e?.message || e);
  }
}

export function validateConfig({ requiresAuth = true } = {}, cfg = getConfig()) {
  const errors = [];
  if (!cfg?.baseUrl) {
    errors.push("DOCSPACE_BASE_URL is not set");
  }
  if (requiresAuth && !cfg?.rawAuthToken) {
    errors.push("DOCSPACE_AUTH_TOKEN (or DOCSPACE_AUTHORIZATION) is not set");
  }
  return errors;
}
