import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  createDocSpaceUser,
  createPatientRoom,
  createPatientFolders,
  ensureRoomMembers,
  ensureExternalLinkAccess,
  getFileInfo,
  getFillOutLink,
  getSelfProfileWithToken,
  findRoomByCandidates,
  getRoomInfo,
  authenticateUser,
  requireFormsRoom,
  setFileExternalLink,
  updateMember
} from "../docspaceClient.js";
import { config } from "../config.js";
import {
  hasFillSignAssignmentForRoomTemplate,
  recordFillSignAssignment,
  recordPatientMapping
} from "../store.js";

async function ensureAutoFillSignAssignment({ userId, fullName, roomId } = {}) {
  const templateId = String(config.autoFillSignTemplateId || "").trim();
  if (!templateId) return false;
  if (!roomId) return false;
  if (hasFillSignAssignmentForRoomTemplate({ patientRoomId: roomId, templateFileId: templateId })) {
    return true;
  }

  const templateInfo = await getFileInfo(templateId).catch(() => null);
  const desiredTitle = "Link to fill out";
  let fillLink = await getFillOutLink(templateId).catch(() => null);
  const needsFillOutTitle = !String(fillLink?.title || "").toLowerCase().includes("fill out");
  if (!fillLink?.shareLink || needsFillOutTitle) {
    fillLink =
      (await ensureExternalLinkAccess(templateId, { access: "FillForms", title: desiredTitle }).catch(() => null)) ||
      (await setFileExternalLink(templateId, "", { access: "FillForms" }).catch(() => null)) ||
      fillLink;
  }
  if (!fillLink?.shareLink) return false;

  const formsRoom = await requireFormsRoom().catch(() => null);
  recordFillSignAssignment({
    assignmentId: randomUUID(),
    patientRoomId: String(roomId),
    patientId: userId ? String(userId) : null,
    patientName: fullName || null,
    templateFileId: templateId,
    templateTitle: templateInfo?.title || null,
    requestedBy: config.doctorEmail || "system",
    medicalRoomId: formsRoom?.id ? String(formsRoom.id) : null,
    shareLink: fillLink.shareLink,
    shareToken: fillLink.requestToken || fillLink.shareToken || null
  });
  return true;
}

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const token = await authenticateUser({ userName: email, password });
    if (!token) {
      return res.status(401).json({ error: "DocSpace authentication failed" });
    }
    const user = await getSelfProfileWithToken(token);
    const displayName =
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.userName ||
      user.email;
    const emailPrefix = user.email ? user.email.split("@")[0] : "";
    const candidates = [
      displayName ? `${displayName} - Patient Room` : "",
      user.userName ? `${user.userName} - Patient Room` : "",
      user.email ? `${user.email} - Patient Room` : "",
      emailPrefix ? `${emailPrefix} - Patient Room` : ""
    ];

    let room = await findRoomByCandidates(candidates, token);
    if (!room) {
      room = await findRoomByCandidates(candidates);
    }

    if (room?.id) {
      try {
        await ensureRoomMembers({ roomId: room.id, patientId: user?.id });
      } catch (shareError) {
        console.warn("[login] room share warning", shareError?.message || shareError);
      }
      try {
        const verified = await getRoomInfo(room.id, token);
        room = { ...room, ...verified };
      } catch (verifyError) {
        console.warn("[login] room verify warning", verifyError?.message || verifyError);
      }
    }

    if (user?.id && room?.id) {
      recordPatientMapping({ userId: user.id, roomId: room.id, patientName: displayName });
      await ensureAutoFillSignAssignment({ userId: user.id, fullName: displayName, roomId: room.id }).catch(
        (e) => console.warn("[login] auto fill-sign assignment failed", e?.message || e)
      );
    }
    res.json({ user, room, token });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { fullName, email, password, phone } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: "Full name, email, and password are required" });
    }
    let user = await createDocSpaceUser({ fullName, email, password });
    const room = await createPatientRoom({ fullName, userId: user.id });
    const folders = await createPatientFolders({ roomId: room.id });
    recordPatientMapping({ userId: user.id, roomId: room.id, patientName: fullName });

    const warnings = [];
    const autoAssigned = await ensureAutoFillSignAssignment({
      userId: user?.id,
      fullName,
      roomId: room?.id
    }).catch((e) => {
      console.warn("[register] auto fill-sign assignment failed", e?.message || e);
      return false;
    });
    if (String(config.autoFillSignTemplateId || "").trim() && !autoAssigned) {
      warnings.push("Auto Fill & Sign assignment failed (template link unavailable).");
    }
    if (phone) {
      try {
        const updateResult = await updateMember({ userId: user.id, phone });
        user = updateResult.user || user;
        if (updateResult.warnings?.length) {
          warnings.push(...updateResult.warnings);
        }
      } catch (profileError) {
        warnings.push(profileError.message || "Failed to save phone number");
      }
    }
    try {
      await ensureRoomMembers({ roomId: room.id, patientId: user.id });
    } catch (shareError) {
      warnings.push(shareError.message || "Failed to share room");
    }
    res.json({ user, room, folders, warnings });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/session", (_req, res) => {
  res.status(501).json({ error: "Session storage disabled for local-only setup" });
});

export default router;
