import { Router } from "express";
import {
  getAdminProfile,
  getFileInfo,
  getFileExternalLinks,
  startFilling,
  getFolderContents,
  getFormsRoomFolders,
  getTokenClaims,
  requireFormsRoom
} from "../docspaceClient.js";
import { resolveFillSignAssignments } from "../fillSignStatus.js";
import { listFillSignAssignmentsForRoom } from "../store.js";

const router = Router();

router.get("/admin-claims", async (_req, res) => {
  try {
    const [profile, claims] = await Promise.all([getAdminProfile(), getTokenClaims()]);
    res.json({
      profile: {
        id: profile?.id,
        displayName: profile?.displayName,
        email: profile?.email,
        isAdmin: profile?.isAdmin,
        isOwner: profile?.isOwner,
        isRoomAdmin: profile?.isRoomAdmin,
        isCollaborator: profile?.isCollaborator
      },
      claims
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/forms-room/scan", async (req, res) => {
  try {
    const patientRoomId = String(req.query.patientRoomId || "").trim();
    const patientName = String(req.query.patientName || "").trim();
    const room = await requireFormsRoom();
    const folders = await getFormsRoomFolders(room.id);

    const listFolder = async (folderId, depth = 0, maxDepth = 4) => {
      const contents = await getFolderContents(folderId).catch(() => null);
      if (!contents?.id) return null;
      const items = (contents.items || []).map((item) => ({
        type: item.type,
        id: item.id,
        title: item.title
      }));
      const node = {
        id: contents.id,
        title: contents.title,
        items
      };
      if (depth >= maxDepth) return node;
      const subfolders = (contents.items || []).filter((i) => i.type === "folder");
      if (!subfolders.length) return node;
      node.folders = [];
      for (const f of subfolders) {
        const child = await listFolder(f.id, depth + 1, maxDepth);
        if (child) node.folders.push(child);
      }
      return node;
    };

    const assignments = patientRoomId ? listFillSignAssignmentsForRoom(patientRoomId) : [];
    const resolved = patientName ? await resolveFillSignAssignments(assignments, { patientName }) : null;

    return res.json({
      formsRoom: room,
      folders,
      inProcessTree: await listFolder(folders.inProcess.id),
      completeTree: await listFolder(folders.complete.id),
      assignmentsCount: assignments.length,
      resolved
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/file-info", async (req, res) => {
  try {
    const fileId = String(req.query.fileId || "").trim();
    if (!fileId) {
      return res.status(400).json({ error: "fileId is required" });
    }
    const info = await getFileInfo(fileId).catch((error) => {
      const err = new Error(error?.message || "Failed to load file info");
      err.status = error?.status || 500;
      err.details = error?.details || null;
      throw err;
    });
    return res.json({ info });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/file-links", async (req, res) => {
  try {
    const fileId = String(req.query.fileId || "").trim();
    if (!fileId) {
      return res.status(400).json({ error: "fileId is required" });
    }
    const links = await getFileExternalLinks(fileId).catch((error) => {
      const err = new Error(error?.message || "Failed to load file links");
      err.status = error?.status || 500;
      err.details = error?.details || null;
      throw err;
    });
    return res.json({ links });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.put("/startfilling", async (req, res) => {
  try {
    const fileId = String(req.query.fileId || "").trim();
    if (!fileId) {
      return res.status(400).json({ error: "fileId is required" });
    }
    const response = await startFilling(fileId).catch((error) => {
      const err = new Error(error?.message || "Failed to start filling");
      err.status = error?.status || 500;
      err.details = error?.details || null;
      throw err;
    });
    return res.json({ response });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/fill-sign/resolve", async (req, res) => {
  try {
    const patientRoomId = String(req.query.patientRoomId || "").trim();
    const patientName = String(req.query.patientName || "").trim();
    if (!patientRoomId) {
      return res.status(400).json({ error: "patientRoomId is required" });
    }
    if (!patientName) {
      return res.status(400).json({ error: "patientName is required" });
    }
    const assignments = listFillSignAssignmentsForRoom(patientRoomId);
    const resolved = await resolveFillSignAssignments(assignments, { patientName });
    return res.json({ patientRoomId, patientName, assignmentsCount: assignments.length, resolved });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/fill-sign/assignments", async (req, res) => {
  try {
    const patientRoomId = String(req.query.patientRoomId || "").trim();
    if (!patientRoomId) {
      return res.status(400).json({ error: "patientRoomId is required" });
    }
    const assignments = listFillSignAssignmentsForRoom(patientRoomId);
    return res.json({ patientRoomId, assignments });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

export default router;
