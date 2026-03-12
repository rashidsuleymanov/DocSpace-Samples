async function request(path, { method = "GET", body } = {}) {
  const headers = body ? { "Content-Type": "application/json" } : {};
  const response = await fetch(path, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || data?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

export async function getDemoSession() {
  return request("/api/demo/session");
}

export async function startDemo({ patientName, doctorName } = {}) {
  return request("/api/demo/start", {
    method: "POST",
    body: {
      patientName: patientName || "Demo Patient",
      doctorName: doctorName || "Demo Doctor"
    }
  });
}

export async function endDemo() {
  return request("/api/demo/end", { method: "POST" });
}

