import { Router } from "express";
import {
  copyFileToFolder,
  createFolderDocument,
  createFolderInParent,
  ensureRoomFolderByTitle,
  getFolderContents
} from "../docspaceClient.js";
import {
  addRequestUpload,
  createRequestRecord,
  getRequestById,
  listRequests
} from "../store.js";

const router = Router();

router.get("/", (req, res) => {
  const roomId = req.query.roomId;
  const items = listRequests({ roomId });
  return res.json({ requests: items });
});

router.post("/", async (req, res) => {
  try {
    const { roomId, title, periodFrom, periodTo, requiredDocuments = [] } = req.body || {};
    if (!roomId || !title) {
      return res.status(400).json({ error: "roomId and title are required" });
    }
    const rootFolder = await ensureRoomFolderByTitle(roomId, "Requests Inbox");
    if (!rootFolder?.id) {
      return res.status(500).json({ error: "Requests Inbox folder not found" });
    }
    const shortId = Math.random().toString(36).slice(2, 7).toUpperCase();
    const date = new Date().toISOString().slice(0, 10);
    const folderTitle = `Request - ${title} - ${date} - ${shortId}`;
    const folder = await createFolderInParent({ parentId: rootFolder.id, title: folderTitle });
    const record = createRequestRecord({
      roomId,
      title,
      periodFrom: periodFrom || "",
      periodTo: periodTo || "",
      requiredDocuments,
      folder: {
        id: folder?.id || null,
        title: folder?.title || folderTitle
      }
    });
    return res.json({ request: record });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/:id/upload-local", async (req, res) => {
  try {
    const { folderId, fileName, requiredKey } = req.body || {};
    if (!folderId || !fileName) {
      return res.status(400).json({ error: "folderId and fileName are required" });
    }
    const record = getRequestById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Request not found" });
    }
    const file = await createFolderDocument({
      folderId,
      title: String(fileName).trim() || "Upload.docx"
    });
    const normalized = file
      ? {
          id: file.id,
          title: file.title,
          url: file.webUrl || file.viewUrl || null
        }
      : null;
    const updated = addRequestUpload({
      requestId: record.id,
      requiredKey,
      file: normalized
    });
    return res.json({ file: normalized, request: updated });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/:id/upload-copy", async (req, res) => {
  try {
    const { fileId, destFolderId, requiredKey } = req.body || {};
    if (!fileId || !destFolderId) {
      return res.status(400).json({ error: "fileId and destFolderId are required" });
    }
    const record = getRequestById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Request not found" });
    }
    await copyFileToFolder({ fileId: String(fileId), destFolderId: String(destFolderId) });
    const contents = await getFolderContents(String(destFolderId));
    const files = (contents?.items || []).filter((item) => item.type === "file");
    const latest = files.find((item) => String(item.id) !== String(fileId)) || files[0] || null;
    const updated = addRequestUpload({
      requestId: record.id,
      requiredKey,
      file: latest
    });
    return res.json({ file: latest, request: updated });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/:id/folder", async (req, res) => {
  try {
    const record = getRequestById(req.params.id);
    if (!record?.folder?.id) {
      return res.status(404).json({ error: "Request folder not found" });
    }
    const contents = await getFolderContents(record.folder.id);
    return res.json({ contents });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

export default router;
