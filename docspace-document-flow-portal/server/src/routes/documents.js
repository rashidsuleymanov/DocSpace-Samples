import { Router } from "express";
import {
  copyFileToFolder,
  createFolderDocument,
  getRoomSummary,
  getFolderContents,
  updateMember,
  getRoomInfo,
  setFileExternalLink
} from "../docspaceClient.js";

const router = Router();

router.get("/room-summary", async (req, res) => {
  try {
    const roomId = req.query.roomId;
    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }
    const summary = await getRoomSummary(roomId, auth);
    return res.json({ summary });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/room-info", async (req, res) => {
  try {
    const roomId = req.query.roomId;
    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }
    const room = await getRoomInfo(roomId, auth);
    return res.json({ room });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/folder-contents", async (req, res) => {
  try {
    const folderId = req.query.folderId;
    if (!folderId) {
      return res.status(400).json({ error: "folderId is required" });
    }
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }
    const contents = await getFolderContents(folderId, auth);
    return res.json({ contents });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/file-share-link", async (req, res) => {
  try {
    const { fileId } = req.body || {};
    if (!fileId) {
      return res.status(400).json({ error: "fileId is required" });
    }
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }
    const link = await setFileExternalLink(String(fileId), auth);
    return res.json({ link });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/update-profile", async (req, res) => {
  try {
    const { userId, fullName, email, phone, roomId, sex, location, title, comment } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    const result = await updateMember({
      userId,
      fullName,
      email,
      phone,
      sex,
      location,
      title,
      comment
    });
    const user = result?.user || null;
    const room = roomId ? await getRoomInfo(roomId).catch(() => null) : null;
    return res.json({
      user,
      room,
      warnings: result?.warnings || [],
      requested: result?.requested || null
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/upload-local", async (req, res) => {
  try {
    const { folderId, fileName } = req.body || {};
    if (!folderId || !fileName) {
      return res.status(400).json({ error: "folderId and fileName are required" });
    }
    const title = String(fileName).trim();
    const file = await createFolderDocument({
      folderId,
      title: title || "Upload.docx"
    });
    return res.json({
      file: file
        ? {
            id: file.id,
            title: file.title,
            url: file.webUrl || file.viewUrl || null
          }
        : null
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/copy-file", async (req, res) => {
  try {
    const { fileId, destFolderId } = req.body || {};
    if (!fileId || !destFolderId) {
      return res.status(400).json({ error: "fileId and destFolderId are required" });
    }
    await copyFileToFolder({ fileId: String(fileId), destFolderId: String(destFolderId) });
    const contents = await getFolderContents(String(destFolderId));
    const files = (contents?.items || []).filter((item) => item.type === "file");
    const latest = files.find((item) => String(item.id) !== String(fileId)) || files[0] || null;
    return res.json({ file: latest });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

export default router;
