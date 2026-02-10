import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  ensureExternalLinkAccess,
  getFillOutLink,
  getFileInfo,
  getRoomInfo,
  getSelfProfileWithToken,
  requireFormsRoom,
  setFileExternalLink
} from "../docspaceClient.js";
import { getConfig, updateConfig } from "../config.js";
import { createFlow, listFlowsForUser } from "../store.js";
import { getProject } from "../store.js";

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
    const targetProjectId = String(req.body?.projectId || "").trim();
    const configuredRoomId = String(cfg.formsRoomId || "").trim();
    const targetRoomId = targetProjectId ? String(getProject(targetProjectId)?.roomId || "").trim() : configuredRoomId;
    if (!targetRoomId) {
      return res.status(400).json({
        error: "No target project selected",
        details: "Pick a project (or set a current project in Projects) first."
      });
    }

    const templateFileId = String(req.body?.templateFileId || "").trim();
    if (!templateFileId) {
      return res.status(400).json({ error: "templateFileId is required" });
    }

    const [user, templateInfo, formsRoom, roomAccess] = await Promise.all([
      getSelfProfileWithToken(auth),
      getFileInfo(templateFileId).catch(() => null),
      requireFormsRoom().catch(() => null),
      getRoomInfo(targetRoomId, auth).catch(() => null)
    ]);

    if (!templateInfo?.id) {
      return res.status(404).json({ error: "Template file not found" });
    }
    if (!formsRoom?.id) {
      return res.status(404).json({ error: "Forms room not found" });
    }
    if (!roomAccess?.id) {
      return res.status(403).json({ error: "No access to the selected project" });
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

    // Set as current project when explicitly chosen (or when current is missing/outdated).
    if (targetProjectId && targetRoomId) {
      const project = getProject(targetProjectId);
      if (project?.roomId) {
        await updateConfig({ formsRoomId: String(project.roomId), formsRoomTitle: String(project.title || "") }).catch(() => null);
      }
    } else if (!configuredRoomId && targetRoomId) {
      await updateConfig({ formsRoomId: String(targetRoomId), formsRoomTitle: String(roomAccess?.title || "") }).catch(() => null);
    }

    const flow = createFlow({
      id: randomUUID(),
      templateFileId,
      templateTitle: templateInfo.title || null,
      fileId: String(templateInfo.id),
      fileTitle: templateInfo.title || null,
      projectRoomId: targetRoomId || null,
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
