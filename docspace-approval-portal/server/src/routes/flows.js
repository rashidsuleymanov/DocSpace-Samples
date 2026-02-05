import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  ensureExternalLinkAccess,
  getFileInfo,
  getFillOutLink,
  getSelfProfileWithToken,
  setFileExternalLink
} from "../docspaceClient.js";
import { createFlow, listFlowsForUser } from "../store.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const userId = String(req.query.userId || "").trim();
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
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
    const templateFileId = String(req.body?.templateFileId || "").trim();
    if (!templateFileId) {
      return res.status(400).json({ error: "templateFileId is required" });
    }

    const [user, templateInfo] = await Promise.all([
      getSelfProfileWithToken(auth),
      getFileInfo(templateFileId).catch(() => null)
    ]);

    if (!templateInfo?.id) {
      return res.status(404).json({ error: "Template file not found" });
    }

    const desiredTitle = "Link to fill out";
    let fillLink = await getFillOutLink(templateFileId, auth).catch(() => null);
    const needsFillOutTitle = !String(fillLink?.title || "").toLowerCase().includes("fill out");
    if (!fillLink?.shareLink || needsFillOutTitle) {
      fillLink =
        (await ensureExternalLinkAccess(
          templateFileId,
          { access: "FillForms", title: desiredTitle },
          auth
        ).catch(() => null)) ||
        (await setFileExternalLink(templateFileId, auth, { access: "FillForms" }).catch(() => null)) ||
        (await ensureExternalLinkAccess(templateFileId, { access: "FillForms", title: desiredTitle }).catch(
          () => null
        )) ||
        (await setFileExternalLink(templateFileId, "", { access: "FillForms" }).catch(() => null)) ||
        fillLink;
    }

    if (!fillLink?.shareLink) {
      return res.status(500).json({ error: "Unable to obtain fill-out link for template" });
    }

    const displayName =
      user?.displayName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      user?.userName ||
      user?.email ||
      null;

    const flow = createFlow({
      id: randomUUID(),
      templateFileId,
      templateTitle: templateInfo.title || null,
      createdByUserId: user?.id,
      createdByName: displayName,
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

