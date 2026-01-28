import { Router } from "express";
import { createFolderDocument, getOfficerProfile, getFolderContents } from "../docspaceClient.js";
import { closeApplication, getApplicationById, listApplications } from "../store.js";
import { config } from "../config.js";

const router = Router();

function normalizeAuthHeader(value) {
  if (!value) return "";
  if (value.startsWith("Bearer ") || value.startsWith("Basic ") || value.startsWith("ASC ")) {
    return value;
  }
  return `Bearer ${value}`;
}

router.get("/session", async (_req, res) => {
  try {
    const officer = await getOfficerProfile();
    if (!officer) {
      return res.status(404).json({ error: "Officer is not configured" });
    }
    const token = normalizeAuthHeader(config.rawAuthToken || "");
    return res.json({
      officer: {
        id: officer.id,
        displayName: officer.displayName || officer.userName,
        email: officer.email,
        title: officer.title || "",
        avatar: officer.avatar || "",
        token: token || null
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/applications", (_req, res) => {
  const items = listApplications({ status: "Submitted" });
  return res.json({ applications: items });
});

router.get("/applications/:id", async (req, res) => {
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

router.post("/applications/:id/issue-docx", async (req, res) => {
  try {
    const record = getApplicationById(req.params.id);
    if (!record?.folder?.id) {
      return res.status(404).json({ error: "Application folder not found" });
    }
    const date = new Date().toISOString().slice(0, 10);
    const file = await createFolderDocument({
      folderId: record.folder.id,
      title: `Decision ${date}.docx`
    });
    const issued = file
      ? {
          id: file.id,
          title: file.title,
          url: file.webUrl || file.viewUrl || file.url || null,
          shareToken: file.shareToken || null
        }
      : null;
    return res.json({ application: record, file: issued });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/applications/:id/close", (req, res) => {
  try {
    const record = getApplicationById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Application not found" });
    }
    const issued = req.body?.issuedDocument || null;
    const updated = closeApplication({ applicationId: record.id, issuedDocument: issued });
    return res.json({ application: updated });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

export default router;
