import { Router } from "express";
import {
  copyFileToFolder,
  createFolderInParent,
  createFolderDocument,
  ensureRoomFolderByTitle,
  getFolderContents,
  getRoomInfo
} from "../docspaceClient.js";
import {
  applicationTypes,
  getApplicationType,
  createApplicationRecord,
  addApplicationUpload,
  submitApplication,
  listApplications,
  getApplicationById
} from "../store.js";

const router = Router();

router.get("/types", (_req, res) => {
  return res.json({ types: applicationTypes });
});

router.get("/", (req, res) => {
  const roomId = req.query.roomId;
  const items = listApplications({ roomId });
  return res.json({ applications: items });
});

router.get("/:id", async (req, res) => {
  try {
    const record = getApplicationById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Application not found" });
    }
    let folderContents = null;
    if (record?.folder?.id) {
      folderContents = await getFolderContents(record.folder.id).catch(() => null);
    }
    return res.json({ application: record, folderContents });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const { roomId, user, typeKey, fields } = req.body || {};
    if (!roomId || !typeKey) {
      return res.status(400).json({ error: "roomId and typeKey are required" });
    }
    const type = getApplicationType(typeKey);
    if (!type) {
      return res.status(400).json({ error: "Unknown application type" });
    }
    const rootFolder = await ensureRoomFolderByTitle(roomId, "Applications");
    if (!rootFolder?.id) {
      return res.status(500).json({ error: "Applications folder not found" });
    }
    const shortId = Math.random().toString(36).slice(2, 7).toUpperCase();
    const date = new Date().toISOString().slice(0, 10);
    const folderTitle = `${type.title} - ${date} - ${shortId}`;
    const folder = await createFolderInParent({ parentId: rootFolder.id, title: folderTitle });
    if (!folder?.id) {
      return res.status(500).json({ error: "Failed to create application folder" });
    }
    const documents = [];
    for (const docTitle of type.formDocuments || []) {
      const file = await createFolderDocument({
        folderId: folder.id,
        title: `${docTitle}.docx`
      });
      documents.push({
        id: file?.id,
        title: file?.title || docTitle,
        url: file?.webUrl || null,
        shareToken: file?.shareToken || null
      });
    }
    const room = await getRoomInfo(roomId).catch(() => null);
    const record = createApplicationRecord({
      roomId,
      roomTitle: room?.title || "Document Flow Room",
      user: {
        id: user?.docspaceId || user?.id || null,
        name: user?.fullName || "",
        email: user?.email || ""
      },
      type: {
        key: type.key,
        title: type.title,
        description: type.description
      },
      fields: fields || {},
      requiredDocuments: type.requiredDocuments || [],
      folder: {
        id: folder.id,
        title: folder.title,
        webUrl: folder.webUrl || null
      },
      documents
    });
    return res.json({ application: record });
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
    const record = getApplicationById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Application not found" });
    }
    const title = String(fileName).trim();
    const file = await createFolderDocument({
      folderId,
      title: title || "Upload.docx"
    });
    const normalized = file
      ? {
          id: file.id,
          title: file.title,
          url: file.webUrl || file.viewUrl || null
        }
      : null;
    const updated = addApplicationUpload({
      applicationId: record.id,
      requiredKey,
      file: normalized
    });
    return res.json({ file: normalized, application: updated });
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
    const record = getApplicationById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Application not found" });
    }
    await copyFileToFolder({ fileId: String(fileId), destFolderId: String(destFolderId) });
    const contents = await getFolderContents(String(destFolderId));
    const files = (contents?.items || []).filter((item) => item.type === "file");
    const latest = files.find((item) => String(item.id) !== String(fileId)) || files[0] || null;
    const updated = addApplicationUpload({
      applicationId: record.id,
      requiredKey,
      file: latest
    });
    return res.json({ file: latest, application: updated });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/:id/submit", (req, res) => {
  try {
    const record = submitApplication(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Application not found" });
    }
    if (record.error) {
      return res.status(400).json({ error: record.error });
    }
    return res.json({ application: record });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

export default router;
