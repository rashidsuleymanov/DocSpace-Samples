function toErrorMessage(data, fallback) {
  const details =
    typeof data?.details === "string"
      ? data.details
      : data?.details
        ? JSON.stringify(data.details)
        : "";
  const message = data?.error || fallback;
  return details ? `${message}: ${details}` : message;
}

export async function login({ email, password }) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, "DocSpace login failed"));
  }
  return {
    token: data?.token || null,
    user: data?.user || null,
    formsRoom: data?.formsRoom || null
  };
}

export async function listTemplates({ token }) {
  const response = await fetch("/api/templates", {
    headers: { Authorization: token }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Templates load failed (${response.status})`));
  }
  return data;
}

export async function listFlows({ userId }) {
  const response = await fetch(`/api/flows?userId=${encodeURIComponent(userId)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Flows load failed (${response.status})`));
  }
  return data;
}

export async function createFlowFromTemplate({ token, templateFileId }) {
  const response = await fetch("/api/flows/from-template", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ templateFileId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toErrorMessage(data, `Flow creation failed (${response.status})`));
  }
  return data;
}

