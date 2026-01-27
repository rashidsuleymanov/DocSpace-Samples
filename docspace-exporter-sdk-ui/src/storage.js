export const STORAGE_KEY = "docspace-exporter-sdk-ui:v1";

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSettings(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearSettings() {
  localStorage.removeItem(STORAGE_KEY);
}
