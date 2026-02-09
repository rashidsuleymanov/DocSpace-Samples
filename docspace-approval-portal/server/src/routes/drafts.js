import { Router } from "express";
import {
  copyFilesToFolder,
  createFileInMyDocuments,
  getFileInfo,
  getFolderContents,
  getFormsRoomFolders,
  getMyDocuments
} from "../docspaceClient.js";
import { getProject } from "../store.js";
import { updateConfig } from "../config.js";

const router = Router();

function isPdfTitle(title) {
  const t = String(title || "").trim().toLowerCase();
  return Boolean(t) && t.endsWith(".pdf");
}

function isPdfFileInfo(info) {
  const ext = String(info?.fileExst || info?.fileExt || "").trim().toLowerCase();
  const title = String(info?.title || "").trim().toLowerCase();
  if (ext === "pdf" || ext === ".pdf") return true;
  if (title.endsWith(".pdf")) return true;
  return false;
}

function isPdfEntry(entry) {
  const ext = String(entry?.fileExst || "").trim().toLowerCase();
  const title = String(entry?.title || "").trim().toLowerCase();
  return ext === "pdf" || ext === ".pdf" || title.endsWith(".pdf");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function requireUserToken(req) {
  const auth = String(req.headers.authorization || "").trim();
  if (!auth) {
    const err = new Error("Authorization token is required");
    err.status = 401;
    throw err;
  }
  return auth;
}

router.get("/", async (req, res) => {
  try {
    const auth = requireUserToken(req);
    const contents = await getMyDocuments(auth);
    const items = Array.isArray(contents?.items) ? contents.items : [];
    const files = items
      .filter((i) => i.type === "file")
      .filter((f) => {
        const ext = String(f?.fileExst || "").trim().toLowerCase();
        const title = String(f?.title || "").trim().toLowerCase();
        return ext === "pdf" || ext === ".pdf" || title.endsWith(".pdf");
      })
      .map((f) => ({
        id: f.id,
        title: f.title,
        fileExst: f.fileExst || null,
        isForm: f.isForm ?? null,
        webUrl: f.webUrl || null,
        created: f.created || null,
        updated: f.updated || null
      }));
    res.json({ folder: { id: contents?.id || "@my", title: contents?.title || "My documents" }, drafts: files });
  } catch (error) {
    const status = error.status || 500;
    const details = error.details || null;
    const docSpaceErr = details?.error || null;
    const docSpaceType = typeof docSpaceErr?.type === "string" ? docSpaceErr.type : "";
    const docSpaceMsg = typeof docSpaceErr?.message === "string" ? docSpaceErr.message : "";

    if (
      status === 404 &&
      docSpaceType.includes("ItemNotFoundException") &&
      docSpaceMsg.toLowerCase().includes("required folder was not found")
    ) {
      return res.status(404).json({
        error: "My documents is not available for this DocSpace account.",
        details: {
          hint: "This can happen for guest/external users. Try signing in with an internal DocSpace user or ask your admin to enable personal documents."
        }
      });
    }

    res.status(status).json({ error: error.message, details: details?.error ? { message: docSpaceMsg, type: docSpaceType } : null });
  }
});

router.post("/", async (req, res) => {
  try {
    const auth = requireUserToken(req);
    const { title } = req.body || {};
    if (!isPdfTitle(title)) return res.status(400).json({ error: "Only .pdf templates are supported" });
    const created = await createFileInMyDocuments({ title }, auth);
    res.json({ file: created });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.details || null });
  }
});

router.post("/publish", async (req, res) => {
  try {
    const auth = requireUserToken(req);
    const fileId = String(req.body?.fileId || "").trim();
    const projectId = String(req.body?.projectId || "").trim();
    const activate = req.body?.activate !== false;

    if (!fileId) return res.status(400).json({ error: "fileId is required" });
    if (!projectId) return res.status(400).json({ error: "projectId is required" });

    const project = getProject(projectId);
    if (!project?.roomId) return res.status(404).json({ error: "Project not found" });

    const info = await getFileInfo(fileId, auth).catch(() => null);
    if (!isPdfFileInfo(info)) return res.status(400).json({ error: "Only .pdf templates can be published" });

    const folders = await getFormsRoomFolders(project.roomId, auth).catch(() => null);
    const destFolderId = String(folders?.templates?.id || project.roomId || "").trim();
    if (!destFolderId) return res.status(500).json({ error: "Unable to determine destination folder" });
    const inProcessFolderId = String(folders?.inProcess?.id || "").trim();

    const before = await getFolderContents(destFolderId).catch(() => null);
    const beforeIds = new Set((before?.items || []).filter((i) => i.type === "file").map((i) => String(i.id)));

    const operation = await copyFilesToFolder(
      // Publishing a template should copy into Templates; `toFillOut` can move the copy to an "in-progress" folder.
      { fileIds: [fileId], destFolderId, deleteAfter: false, toFillOut: false },
      auth
    );

    let createdFile = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const after = await getFolderContents(destFolderId).catch(() => null);
      const items = Array.isArray(after?.items) ? after.items : [];
      const candidates = items.filter((i) => i.type === "file" && !beforeIds.has(String(i.id)) && isPdfEntry(i));
      const matchByTitle = candidates.find((i) => String(i.title || "").trim() === String(info?.title || "").trim()) || null;
      createdFile = matchByTitle || candidates[0] || null;
      if (createdFile?.id) break;
      await sleep(450);
    }
    let createdIn = createdFile?.id ? "templates" : null;

    if (!createdFile?.id && inProcessFolderId) {
      const beforeIn = await getFolderContents(inProcessFolderId).catch(() => null);
      const beforeInIds = new Set((beforeIn?.items || []).filter((i) => i.type === "file").map((i) => String(i.id)));
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const after = await getFolderContents(inProcessFolderId).catch(() => null);
        const items = Array.isArray(after?.items) ? after.items : [];
        const candidates = items.filter((i) => i.type === "file" && !beforeInIds.has(String(i.id)) && isPdfEntry(i));
        const matchByTitle = candidates.find((i) => String(i.title || "").trim() === String(info?.title || "").trim()) || null;
        createdFile = matchByTitle || candidates[0] || createdFile;
        if (createdFile?.id) {
          createdIn = "inProcess";
          break;
        }
        await sleep(450);
      }
    }

    if (activate) {
      await updateConfig({ formsRoomId: String(project.roomId), formsRoomTitle: String(project.title || "") }).catch(() => null);
    }

    res.json({
      ok: true,
      project: { id: project.id, title: project.title, roomId: project.roomId, roomUrl: project.roomUrl || null },
      destFolderId,
      operation,
      createdIn,
      createdFile: createdFile?.id
        ? { id: createdFile.id, title: createdFile.title || null, fileExst: createdFile.fileExst || null, isForm: createdFile.isForm ?? null }
        : null
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.details || null });
  }
});

export default router;
