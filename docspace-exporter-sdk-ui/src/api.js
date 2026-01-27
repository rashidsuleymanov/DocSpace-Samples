function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

const backendUrl = normalizeBaseUrl(new URLSearchParams(window.location.search).get("backendUrl"));

function withBase(path) {
  if (!backendUrl) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${backendUrl}${path}`;
}

export async function apiPost(path, body) {
  const response = await fetch(withBase(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const message = data?.error || response.statusText;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}
