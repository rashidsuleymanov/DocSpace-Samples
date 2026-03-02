export async function api(path, { method = "GET", body, headers } = {}) {
  const finalHeaders = { ...(headers || {}) };
  if (body && !(body instanceof FormData)) {
    finalHeaders["Content-Type"] = "application/json";
  }

  const res = await fetch(path, {
    method,
    headers: finalHeaders,
    credentials: "include",
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error || data?.message || res.statusText || "Request failed";
    const err = new Error(message);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}
