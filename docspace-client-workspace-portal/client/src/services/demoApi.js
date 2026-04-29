const emptySession = null;

export async function getDemoSession() {
  const response = await fetch("/api/demo/session", {
    credentials: "include"
  });
  if (response.status === 204) {
    return emptySession;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load demo session");
  }
  return normalizeDemoSession(data);
}

export async function startDemo(payload) {
  const response = await fetch("/api/demo/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Failed to start demo");
  }
  return normalizeDemoSession(data);
}

export async function endDemo() {
  const response = await fetch("/api/demo/end", {
    method: "POST",
    credentials: "include"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Failed to end demo");
  }
  return data;
}

function normalizeUser(user, token, role) {
  const displayName = user?.displayName || user?.email || role;
  return {
    id: user?.id || "",
    displayName,
    email: user?.email || "",
    title: user?.title || "",
    initials: displayName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    token: token || ""
  };
}

function normalizeDemoSession(data) {
  if (!data?.client?.user || !data?.manager?.user) {
    return emptySession;
  }
  const room = {
    id: data.client?.room?.id || "",
    title: data.client?.room?.title || "Client Workspace",
    url: data.client?.room?.webUrl || ""
  };
  return {
    sessionId: data.sessionId || "",
    room,
    client: {
      user: normalizeUser(data.client.user, data.client.token, "client"),
      room
    },
    manager: {
      user: normalizeUser(data.manager.user, data.manager.token, "manager"),
      room
    }
  };
}
