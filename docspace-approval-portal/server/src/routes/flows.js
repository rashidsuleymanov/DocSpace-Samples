import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  ensureExternalLinkAccess,
  getFillOutLink,
  getFileInfo,
  getSelfProfileWithToken,
  requireFormsRoom,
  setFileExternalLink
} from "../docspaceClient.js";
import { getConfig } from "../config.js";
import { createFlow, listFlowsForUser } from "../store.js";

const router = Router();

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
    const user = await getSelfProfileWithToken(auth);
    const userId = String(user?.id || "").trim();
    if (!userId) return res.status(401).json({ error: "Invalid user token" });
    res.json({ flows: listFlowsForUser(userId) });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/from-template", async (req, res) => {
  try {
    const auth = String(req.headers.authorization || "").trim();
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const cfg = getConfig();
    if (!String(cfg.formsRoomId || "").trim()) {
      return res.status(400).json({
        error: "No current project selected",
        details: "Open Projects and select (or create) a project first."
      });
    }

    const templateFileId = String(req.body?.templateFileId || "").trim();
    if (!templateFileId) {
      return res.status(400).json({ error: "templateFileId is required" });
    }

    const [user, templateInfo, formsRoom] = await Promise.all([
      getSelfProfileWithToken(auth),
      getFileInfo(templateFileId).catch(() => null),
      requireFormsRoom().catch(() => null)
    ]);

    if (!templateInfo?.id) {
      return res.status(404).json({ error: "Template file not found" });
    }
    if (!formsRoom?.id) {
      return res.status(404).json({ error: "Forms room not found" });
    }

    const displayName =
      user?.displayName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      user?.userName ||
      user?.email ||
      "User";

    const desiredTitle = "Link to fill out";
    let fillLink = await getFillOutLink(templateFileId).catch(() => null);
    const needsFillOutTitle = !String(fillLink?.title || "").toLowerCase().includes("fill out");
    if (!fillLink?.shareLink || needsFillOutTitle) {
      fillLink =
        (await ensureExternalLinkAccess(templateFileId, { access: "FillForms", title: desiredTitle }).catch(() => null)) ||
        (await setFileExternalLink(templateFileId, "", { access: "FillForms" }).catch(() => null)) ||
        fillLink;
    }

    if (!fillLink?.shareLink) {
      return res.status(500).json({ error: "Unable to obtain fill-out link for the selected template" });
    }

    const flow = createFlow({
      id: randomUUID(),
      templateFileId,
      templateTitle: templateInfo.title || null,
      fileId: String(templateInfo.id),
      fileTitle: templateInfo.title || null,
      projectRoomId: String(cfg.formsRoomId || "").trim() || null,
      createdByUserId: user?.id,
      createdByName: displayName || null,
      openUrl: fillLink.shareLink,
      status: "InProgress"
    });

    res.json({ flow });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

export default router;
