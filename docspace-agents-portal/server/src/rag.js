function chunkText(text, { maxChars = 1200, overlap = 140 } = {}) {
  const t = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!t) return [];

  const chunks = [];
  let i = 0;
  while (i < t.length) {
    const end = Math.min(t.length, i + maxChars);
    const chunk = t.slice(i, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= t.length) break;
    i = Math.max(0, end - overlap);
  }
  return chunks;
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function ensureAllowedBucket(state, agentId) {
  state.kbAllowed = state.kbAllowed || {};
  state.kbAllowed[agentId] = state.kbAllowed[agentId] || { file: [], folder: [] };
  state.kbAllowed[agentId].file = state.kbAllowed[agentId].file || [];
  state.kbAllowed[agentId].folder = state.kbAllowed[agentId].folder || [];
  return state.kbAllowed[agentId];
}

export function createRag({ store }) {
  function nextChunkId() {
    store.state.meta = store.state.meta || {};
    if (!store.state.meta.nextChunkId) store.state.meta.nextChunkId = 1;
    const id = store.state.meta.nextChunkId;
    store.state.meta.nextChunkId += 1;
    return id;
  }

  function clearAgent(agentId) {
    const id = String(agentId);
    store.state.kbChunks = (store.state.kbChunks || []).filter((c) => c.agentId !== id);
    if (store.state.kbAllowed) {
      delete store.state.kbAllowed[id];
    }
    store.save();
  }

  function addAllowed(agentId, itemType, itemId) {
    const id = String(agentId);
    const bucket = ensureAllowedBucket(store.state, id);
    const list = itemType === "file" ? bucket.file : bucket.folder;
    const value = String(itemId);
    if (!list.includes(value)) list.push(value);
    store.save();
  }

  function isAllowed(agentId, itemType, itemId) {
    const id = String(agentId);
    const bucket = store.state.kbAllowed?.[id];
    if (!bucket) return false;
    const list = itemType === "file" ? bucket.file : bucket.folder;
    return Array.isArray(list) && list.includes(String(itemId));
  }

  async function upsertFileText({ agentId, file, folderId, text, embedder }) {
    if (!embedder?.embed) throw new Error("embedder is required");
    const id = String(agentId);
    const fileId = String(file.id);
    const fileTitle = file.title || `File ${fileId}`;

    store.state.kbChunks = (store.state.kbChunks || []).filter(
      (c) => !(c.agentId === id && c.fileId === fileId)
    );

    const chunks = chunkText(text);
    if (!chunks.length) {
      store.save();
      return { chunks: 0 };
    }

    const embeddings = await embedder.embed(chunks);
    for (let i = 0; i < chunks.length; i++) {
      store.state.kbChunks.push({
        id: nextChunkId(),
        agentId: id,
        fileId,
        fileTitle,
        folderId: String(folderId),
        chunkIndex: i,
        text: chunks[i],
        embedding: embeddings[i] || [],
        createdAt: new Date().toISOString()
      });
    }

    addAllowed(id, "file", fileId);
    store.save();
    return { chunks: chunks.length };
  }

  async function retrieve({ agentId, query, topK = 6, embedder }) {
    if (!embedder?.embed) throw new Error("embedder is required");
    const q = String(query || "").trim();
    if (!q) return [];
    const qEmb = (await embedder.embed([q]))[0] || [];
    const rows = (store.state.kbChunks || []).filter((c) => c.agentId === String(agentId));
    const scored = rows
      .map((r) => ({ ...r, score: cosine(qEmb, r.embedding || []) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter((x) => x.score > 0.2);

    return scored.map((s) => ({
      fileId: String(s.fileId),
      fileTitle: String(s.fileTitle),
      text: String(s.text),
      score: Number(s.score)
    }));
  }

  return { clearAgent, addAllowed, isAllowed, upsertFileText, retrieve };
}
