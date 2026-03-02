import crypto from "crypto";
import { nowIso } from "./store.js";
import { hashToken, randomToken, safeEqual, sha256Base64Url } from "./security.js";

function uuid() {
  return crypto.randomUUID();
}

function defaultTools() {
  return { allowAllDocSpace: false };
}

function defaultTheme({ name } = {}) {
  const title = String(name || "Chat").trim() || "Chat";
  return {
    title,
    launcherText: title,
    primaryColor: "#0f172a",
    accentColor: "#38bdf8",
    borderRadius: 18,
    position: "right"
  };
}

function defaultBilling() {
  return {
    trialMessages: 5,
    requireOwnKeyAfterTrial: true
  };
}

function defaultLlm() {
  return {
    provider: "ollama",
    openai: {
      apiKey: "",
      chatModel: "gpt-4o-mini",
      embedModel: "text-embedding-3-small"
    },
    ollama: {
      baseUrl: "http://localhost:11434",
      chatModel: "gemma3:4b",
      embedModel: "nomic-embed-text"
    }
  };
}

function normalize(agent) {
  if (!agent) return null;
  const llm = agent.llm || defaultLlm();
  return {
    id: agent.id,
    publicId: agent.publicId,
    ownerId: agent.ownerId || "",
    name: agent.name,
    systemPrompt: agent.systemPrompt,
    llm: {
      provider: agent.llmProvider || llm.provider || "ollama",
      openai: { ...(llm.openai || defaultLlm().openai), apiKey: llm.openai?.apiKey ? "********" : "" },
      ollama: { ...(llm.ollama || defaultLlm().ollama) }
    },
    kb: {
      roomId: agent.kbRoomId,
      includeRoomRoot: agent.kbIncludeRoomRoot !== false,
      folderIds: agent.kbFolderIds || [],
      fileIds: agent.kbFileIds || []
    },
    tools: agent.tools || defaultTools(),
    theme: agent.theme || defaultTheme({ name: agent.name }),
    billing: agent.billing || defaultBilling(),
    embedKey: agent.embedKey || null,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt
  };
}

export function createAgentStore(store) {
  function getAgentRecordById(id) {
    return (store.state.agents || []).find((x) => x.id === String(id)) || null;
  }

  function getAgentRecordByPublicId(publicId) {
    return (store.state.agents || []).find((x) => x.publicId === String(publicId)) || null;
  }

  function listAgents({ ownerId } = {}) {
    const oid = String(ownerId || "").trim();
    return (store.state.agents || [])
      .slice()
      .filter((a) => {
        if (!oid) return true;
        // Backwards compatibility: legacy agents without owner are visible to everyone.
        if (!a.ownerId) return true;
        return String(a.ownerId) === oid;
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((a) => ({
        id: a.id,
        publicId: a.publicId,
        ownerId: a.ownerId || "",
        name: a.name,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt
      }));
  }

  function getAgentById(id) {
    return normalize(getAgentRecordById(id));
  }

  function getAgentByPublicId(publicId) {
    return normalize(getAgentRecordByPublicId(publicId));
  }

  function createAgent({ name = "New agent", ownerId = "" } = {}) {
    const id = uuid();
    const publicId = `a_${randomToken(10)}`;
    const embedKey = `k_${randomToken(18)}`;
    const { salt, hash } = hashToken(embedKey);
    const now = nowIso();
    const agent = {
      id,
      publicId,
      ownerId: String(ownerId || ""),
      name: String(name || "New agent"),
      systemPrompt: "You are a helpful assistant. Use the available tools when needed.",
      llmProvider: "ollama",
      llm: defaultLlm(),
      kbRoomId: "",
      kbIncludeRoomRoot: true,
      kbFolderIds: [],
      kbFileIds: [],
      tools: defaultTools(),
      theme: defaultTheme({ name }),
      billing: defaultBilling(),
      embedKey,
      embedKeySalt: salt,
      embedKeyHash: hash,
      createdAt: now,
      updatedAt: now
    };
    store.state.agents = [...(store.state.agents || []), agent];
    store.save();
    return normalize(agent);
  }

  function updateAgent(id, patch) {
    const agents = store.state.agents || [];
    const idx = agents.findIndex((a) => a.id === String(id));
    if (idx < 0) throw new Error("Agent not found");
    const existing = agents[idx];

    const nextLlmProvider = String(patch?.llm?.provider ?? patch?.llmProvider ?? existing.llmProvider ?? "ollama");
    const rawApiKey =
      patch?.llm?.openai?.apiKey !== undefined
        ? String(patch.llm.openai.apiKey || "")
        : undefined;
    const apiKeyPatch =
      rawApiKey === undefined || rawApiKey === "********"
        ? undefined
        : rawApiKey;

    const nextLlm = patch?.llm
      ? {
          provider: nextLlmProvider,
          openai: {
            ...(existing.llm?.openai || defaultLlm().openai),
            ...(patch.llm.openai || {}),
            apiKey:
              apiKeyPatch !== undefined
                ? apiKeyPatch
                : (existing.llm?.openai?.apiKey || "")
          },
          ollama: {
            ...(existing.llm?.ollama || defaultLlm().ollama),
            ...(patch.llm.ollama || {})
          }
        }
      : existing.llm || defaultLlm();

    const updated = {
      ...existing,
      name: String(patch?.name ?? existing.name ?? "Agent"),
      systemPrompt: String(patch?.systemPrompt ?? existing.systemPrompt ?? ""),
      llmProvider: nextLlmProvider,
      llm: nextLlm,
      kbRoomId: String(patch?.kb?.roomId ?? existing.kbRoomId ?? ""),
      kbIncludeRoomRoot:
        patch?.kb?.includeRoomRoot !== undefined
          ? Boolean(patch.kb.includeRoomRoot)
          : (existing.kbIncludeRoomRoot !== false),
      kbFolderIds: Array.isArray(patch?.kb?.folderIds) ? patch.kb.folderIds.map(String) : existing.kbFolderIds || [],
      kbFileIds: Array.isArray(patch?.kb?.fileIds) ? patch.kb.fileIds.map(String) : existing.kbFileIds || [],
      tools: patch?.tools ? patch.tools : existing.tools || defaultTools(),
      theme: patch?.theme
        ? { ...(existing.theme || defaultTheme({ name: String(patch?.name ?? existing.name ?? "Chat") })), ...(patch.theme || {}) }
        : (existing.theme || defaultTheme({ name: String(patch?.name ?? existing.name ?? "Chat") })),
      billing: patch?.billing ? { ...(existing.billing || defaultBilling()), ...(patch.billing || {}) } : (existing.billing || defaultBilling()),
      updatedAt: nowIso()
    };

    if (!updated.theme?.title) {
      updated.theme = { ...(updated.theme || {}), title: updated.name, launcherText: updated.theme?.launcherText || updated.name };
    }

    const next = agents.slice();
    next[idx] = updated;
    store.state.agents = next;
    store.save();
    return normalize(updated);
  }

  function rotateEmbedKey(id) {
    const agents = store.state.agents || [];
    const idx = agents.findIndex((a) => a.id === String(id));
    if (idx < 0) throw new Error("Agent not found");
    const embedKey = `k_${randomToken(18)}`;
    const { salt, hash } = hashToken(embedKey);
    const updated = { ...agents[idx], embedKey, embedKeySalt: salt, embedKeyHash: hash, updatedAt: nowIso() };
    const next = agents.slice();
    next[idx] = updated;
    store.state.agents = next;
    store.save();
    return embedKey;
  }

  function deleteAgent(id) {
    const agents = store.state.agents || [];
    const idx = agents.findIndex((a) => a.id === String(id));
    if (idx < 0) {
      const err = new Error("Agent not found");
      err.status = 404;
      throw err;
    }
    const agent = agents[idx];
    store.state.agents = agents.filter((a) => a.id !== String(id));

    // Cleanup KB + usage + public files for this agent
    store.state.kbChunks = (store.state.kbChunks || []).filter((c) => c.agentId !== String(agent.id));
    if (store.state.kbAllowed) delete store.state.kbAllowed[String(agent.id)];
    if (store.state.usage) delete store.state.usage[String(agent.id)];
    store.state.publicFiles = (store.state.publicFiles || []).filter((f) => f.agentId !== String(agent.id));

    store.save();
    return { id: agent.id, publicId: agent.publicId, name: agent.name };
  }

  function verifyEmbedKey(publicId, key) {
    const agent = getAgentRecordByPublicId(publicId);
    if (!agent) return null;
    const candidate = sha256Base64Url(`${agent.embedKeySalt}.${String(key || "")}`);
    if (!safeEqual(candidate, agent.embedKeyHash)) return null;
    return { id: agent.id, publicId: agent.publicId, tools: agent.tools || defaultTools() };
  }

  return {
    listAgents,
    getAgentRecordById,
    getAgentRecordByPublicId,
    getAgentById,
    getAgentByPublicId,
    createAgent,
    updateAgent,
    rotateEmbedKey,
    deleteAgent,
    verifyEmbedKey
  };
}

export const defaults = {
  defaultTools,
  defaultTheme,
  defaultBilling,
  defaultLlm
};
