import { extractText } from "./textExtract.js";
import { loadConfig } from "./config.js";

async function walkFolder({ docspace, rag, agentId, folderId, seenFolders, onFile, auth }) {
  const fid = String(folderId);
  if (seenFolders.has(fid)) return;
  seenFolders.add(fid);
  rag.addAllowed(agentId, "folder", fid);

  const contents = await docspace.getFolderContents(fid, auth);
  const items = contents?.items || [];
  const folders = items.filter((i) => i.type === "folder");
  const files = items.filter((i) => i.type === "file");

  for (const f of folders) {
    await walkFolder({ docspace, rag, agentId, folderId: f.id, seenFolders, onFile, auth });
  }

  for (const file of files) {
    await onFile({ folderId: fid, file });
  }
}

export function createKbSync({ store, docspace, rag }) {
  const cfg = loadConfig();

  async function syncAgent(agent, { embedder, auth } = {}) {
    if (!embedder?.embed) throw new Error("embedder is required");
    const agentId = agent.id;
    const roomId = String(agent?.kb?.roomId || "").trim();
    const includeRoomRoot = agent?.kb?.includeRoomRoot !== false;
    const folderIds = Array.isArray(agent?.kb?.folderIds) ? agent.kb.folderIds.map(String) : [];
    const fileIds = Array.isArray(agent?.kb?.fileIds) ? agent.kb.fileIds.map(String) : [];
    if (!roomId) throw new Error("Agent KB roomId is not configured");
    if (!fileIds.length && !includeRoomRoot && !folderIds.length) {
      throw new Error("Agent KB is empty (select files, enable room root, or select folders)");
    }

    const effectiveFolderIds = Array.from(
      new Set([...(includeRoomRoot ? [roomId] : []), ...folderIds].filter(Boolean).map(String))
    );

    store.audit(agentId, "kb_sync_start", { roomId, includeRoomRoot, folderIds, fileIds, effectiveFolderIds });
    rag.clearAgent(agentId);

    rag.addAllowed(agentId, "folder", roomId);
    for (const fid of folderIds) {
      rag.addAllowed(agentId, "folder", fid);
    }
    for (const fid of fileIds) {
      rag.addAllowed(agentId, "file", fid);
    }

    let filesSeen = 0;
    let filesIndexed = 0;
    let chunks = 0;
    const skipped = [];

    function recordSkip(payload) {
      const item = {
        fileId: payload?.fileId ? String(payload.fileId) : null,
        fileTitle: payload?.fileTitle ? String(payload.fileTitle) : null,
        reason: payload?.reason ? String(payload.reason) : "unknown",
        error: payload?.error ? String(payload.error) : null
      };
      skipped.push(item);
      // prevent huge responses/log spam
      if (skipped.length > 30) skipped.shift();
    }
    const seenFolders = new Set();

    async function onFile({ folderId, file }) {
      filesSeen++;
      const fileId = String(file.id);
      rag.addAllowed(agentId, "file", fileId);

      const fileTitle = file.title || `File ${fileId}`;
      const fileSize = typeof file.contentLength === "number" ? file.contentLength : null;
      if (fileSize && fileSize > cfg.docspace.maxFileBytes) {
        const payload = { fileId, fileTitle, reason: "too_large", fileSize };
        store.audit(agentId, "kb_skip_file", payload);
        recordSkip(payload);
        return;
      }

      let buffer;
      try {
        buffer = await docspace.downloadFileBuffer(fileId, auth);
      } catch (err) {
        const payload = { fileId, fileTitle, reason: "download_failed", error: err?.message || String(err) };
        store.audit(agentId, "kb_skip_file", payload);
        recordSkip(payload);
        return;
      }

      if (buffer.length > cfg.docspace.maxFileBytes) {
        const payload = { fileId, fileTitle, reason: "too_large_after_download", fileSize: buffer.length };
        store.audit(agentId, "kb_skip_file", payload);
        recordSkip(payload);
        return;
      }

      let text = "";
      try {
        text = await extractText({
          fileName: fileTitle,
          contentType: file.contentType || "",
          buffer
        });
      } catch (err) {
        const payload = { fileId, fileTitle, reason: "extract_failed", error: err?.message || String(err) };
        store.audit(agentId, "kb_skip_file", payload);
        recordSkip(payload);
        return;
      }

      if (!String(text || "").trim()) {
        const payload = { fileId, fileTitle, reason: "no_text" };
        store.audit(agentId, "kb_skip_file", payload);
        recordSkip(payload);
        return;
      }

      try {
        const res = await rag.upsertFileText({
          agentId,
          file: { id: fileId, title: fileTitle },
          folderId,
          text,
          embedder
        });
        filesIndexed++;
        chunks += res?.chunks || 0;
      } catch (err) {
        const payload = { fileId, fileTitle, reason: "embed_or_insert_failed", error: err?.message || String(err) };
        store.audit(agentId, "kb_skip_file", payload);
        recordSkip(payload);
      }
    }

    // Preferred mode: index only explicitly selected files.
    if (fileIds.length) {
      for (const fileId of fileIds) {
        const fid = String(fileId);
        filesSeen++;
        rag.addAllowed(agentId, "file", fid);

        const info = await docspace.getFileInfo(fid, auth).catch(() => null);
        const fileTitle = info?.title || info?.name || `File ${fid}`;
        const fileSize = typeof info?.contentLength === "number" ? info.contentLength : null;
        if (fileSize && fileSize > cfg.docspace.maxFileBytes) {
          const payload = { fileId: fid, fileTitle, reason: "too_large", fileSize };
          store.audit(agentId, "kb_skip_file", payload);
          recordSkip(payload);
          continue;
        }

        let buffer;
        try {
          buffer = await docspace.downloadFileBuffer(fid, auth);
        } catch (err) {
          const payload = { fileId: fid, fileTitle, reason: "download_failed", error: err?.message || String(err) };
          store.audit(agentId, "kb_skip_file", payload);
          recordSkip(payload);
          continue;
        }

        if (buffer.length > cfg.docspace.maxFileBytes) {
          const payload = { fileId: fid, fileTitle, reason: "too_large_after_download", fileSize: buffer.length };
          store.audit(agentId, "kb_skip_file", payload);
          recordSkip(payload);
          continue;
        }

        let text = "";
        try {
          text = await extractText({
            fileName: fileTitle,
            contentType: info?.contentType || "",
            buffer
          });
        } catch (err) {
          const payload = { fileId: fid, fileTitle, reason: "extract_failed", error: err?.message || String(err) };
          store.audit(agentId, "kb_skip_file", payload);
          recordSkip(payload);
          continue;
        }

        if (!String(text || "").trim()) {
          const payload = { fileId: fid, fileTitle, reason: "no_text" };
          store.audit(agentId, "kb_skip_file", payload);
          recordSkip(payload);
          continue;
        }

        try {
          const res = await rag.upsertFileText({
            agentId,
            file: { id: fid, title: fileTitle },
            folderId: info?.folderId || roomId,
            text,
            embedder
          });
          filesIndexed++;
          chunks += res?.chunks || 0;
        } catch (err) {
          const payload = { fileId: fid, fileTitle, reason: "embed_or_insert_failed", error: err?.message || String(err) };
          store.audit(agentId, "kb_skip_file", payload);
          recordSkip(payload);
        }
      }
    } else {
      // Backwards-compatible mode: index all files under selected room/folders (recursive).
      for (const fid of effectiveFolderIds) {
        await walkFolder({ docspace, rag, agentId, folderId: fid, seenFolders, onFile, auth });
      }
    }

    store.audit(agentId, "kb_sync_done", { filesSeen, filesIndexed, chunks });
    return { filesSeen, filesIndexed, chunks, skipped };
  }

  return { syncAgent };
}
