import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  createPatientRoom,
  createPatientFolders,
  createRoomDocument,
  ensureExternalLinkAccess,
  ensureRoomFolderByTitle,
  ensureRoomMembers,
  getFillOutLink,
  getFolderByTitleWithin,
  getRoomSummary,
  getFolderContents,
  getFormsRoomFolders,
  getNewFolderItems,
  getFileInfo,
  findRoomByCandidates,
  getSelfProfileWithToken,
  updateMember,
  getRoomInfo,
  getDoctorProfile,
  createAppointmentTicket,
  requireFormsRoom,
  copyFileToFolder,
  uploadFileToFolder,
  setFileExternalLink
} from "../docspaceClient.js";
import {
  getPatientRoomIdByUserId,
  listFillSignAssignmentsForRoom,
  recordFillSignAssignment,
  recordAppointment,
  recordPatientMapping,
  listMedicalRecords,
  setFillSignAssignmentState
} from "../store.js";
import { config } from "../config.js";
import { resolveFillSignAssignments } from "../fillSignStatus.js";

const router = Router();

async function loadClientTemplates() {
  const explicitFolderId = String(config.clientTemplatesFolderId || "").trim();
  if (explicitFolderId) {
    const contents = await getFolderContents(explicitFolderId).catch(() => null);
    const files = (contents?.items || [])
      .filter((item) => item?.type === "file")
      .map((item) => ({ id: String(item.id), title: String(item.title || "") }))
      .filter((item) => item.id && item.title)
      .sort((a, b) => a.title.localeCompare(b.title));
    return {
      room: null,
      folder: { id: explicitFolderId, title: "Client Templates" },
      files
    };
  }

  const room = await requireFormsRoom();
  const folders = await getFormsRoomFolders(room.id).catch(() => null);
  const title = String(config.clientTemplatesFolderTitle || "Client Templates").trim();

  const direct = await getFolderByTitleWithin(room.id, title).catch(() => null);
  const nested = folders?.templates?.id
    ? await getFolderByTitleWithin(folders.templates.id, title).catch(() => null)
    : null;
  const folder = direct || nested || null;

  if (!folder?.id) {
    return { room, folder: null, files: [] };
  }

  const contents = await getFolderContents(folder.id).catch(() => null);
  const files = (contents?.items || [])
    .filter((item) => item?.type === "file")
    .map((item) => ({ id: String(item.id), title: String(item.title || "") }))
    .filter((item) => item.id && item.title)
    .sort((a, b) => a.title.localeCompare(b.title));

  return { room, folder, files };
}

async function ensureTemplateInFormsRoom({ sourceFileId, sourceTitle } = {}) {
  const fid = String(sourceFileId || "").trim();
  if (!fid) throw new Error("templateFileId is required");

  const formsRoom = await requireFormsRoom();
  const folders = await getFormsRoomFolders(formsRoom.id).catch(() => null);
  const templatesFolderId = folders?.templates?.id ? String(folders.templates.id) : String(formsRoom.id);

  const desiredTitle = String(sourceTitle || "").trim();
  if (desiredTitle) {
    const existing = await getFolderContents(templatesFolderId).catch(() => null);
    const match = (existing?.items || []).find(
      (item) => item?.type === "file" && String(item.title || "").trim() === desiredTitle
    );
    if (match?.id) {
      return { formsRoom, templateFileId: String(match.id), templatesFolderId };
    }
  }

  const before = await getFolderContents(templatesFolderId).catch(() => null);
  const beforeIds = new Set((before?.items || []).filter((i) => i?.type === "file").map((i) => String(i.id)));

  // Copy template into the Forms room Templates folder. This is required for Fill & Sign workflow.
  await copyFileToFolder({ fileId: fid, destFolderId: templatesFolderId, toFillOut: true });

  const after = await getFolderContents(templatesFolderId).catch(() => null);
  const created =
    (after?.items || []).find((i) => i?.type === "file" && i?.id && !beforeIds.has(String(i.id))) || null;
  const createdId = created?.id ? String(created.id) : "";
  if (!createdId) {
    // Fallback: locate by title if present.
    if (desiredTitle) {
      const byTitle = (after?.items || []).find(
        (item) => item?.type === "file" && String(item.title || "").trim() === desiredTitle
      );
      if (byTitle?.id) {
        return { formsRoom, templateFileId: String(byTitle.id), templatesFolderId };
      }
    }
    throw new Error("Unable to determine copied template in Forms room");
  }

  return { formsRoom, templateFileId: createdId, templatesFolderId };
}

router.post("/bootstrap", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const user = await getSelfProfileWithToken(auth);
    if (!user?.id) {
      return res.status(401).json({ error: "Unable to resolve user from token" });
    }

    const displayName =
      req.body?.fullName ||
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.userName ||
      user.email ||
      "Patient";

    const mappedRoomId = getPatientRoomIdByUserId(user.id);
    if (mappedRoomId) {
      try {
        await ensureRoomMembers({ roomId: mappedRoomId, patientId: user.id });
      } catch (shareError) {
        console.warn("[bootstrap] room share warning", shareError?.message || shareError);
      }

      const room = await getRoomInfo(mappedRoomId, auth).catch(() => ({
        id: mappedRoomId,
        title: `${displayName} - Patient Room`,
        webUrl: null
      }));
      return res.json({ room, folders: null, source: "mapping" });
    }

    const emailPrefix = user.email ? user.email.split("@")[0] : "";
    const candidates = [
      displayName ? `${displayName} - Patient Room` : "",
      user.userName ? `${user.userName} - Patient Room` : "",
      user.email ? `${user.email} - Patient Room` : "",
      emailPrefix ? `${emailPrefix} - Patient Room` : ""
    ];

    let room = await findRoomByCandidates(candidates, auth).catch(() => null);
    if (room?.id) {
      recordPatientMapping({ userId: user.id, roomId: room.id, patientName: displayName });
      try {
        await ensureRoomMembers({ roomId: room.id, patientId: user.id });
      } catch (shareError) {
        console.warn("[bootstrap] room share warning", shareError?.message || shareError);
      }
      return res.json({ room, folders: null, source: "search" });
    }

    room = await createPatientRoom({ fullName: displayName, userId: user.id });
    const folders = await createPatientFolders({ roomId: room.id });
    recordPatientMapping({ userId: user.id, roomId: room.id, patientName: displayName });

    try {
      await ensureRoomMembers({ roomId: room.id, patientId: user.id });
    } catch (shareError) {
      console.warn("[bootstrap] room share warning", shareError?.message || shareError);
    }

    return res.json({ room, folders, source: "created" });
  } catch (error) {
    console.error("[bootstrap]", error?.message || error, error?.details || "");
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

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
    console.error("[room-summary]", error?.message || error, error?.details || "");
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

router.get("/medical-records", async (req, res) => {
  try {
    const roomId = req.query.roomId;
    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }
    const records = listMedicalRecords(roomId);
    return res.json({ records });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/doctor", async (_req, res) => {
  try {
    const doctor = await getDoctorProfile();
    if (!doctor) {
      return res.status(404).json({ error: "Doctor not configured" });
    }
    return res.json({
      doctor: {
        id: doctor.id,
        displayName: doctor.displayName || doctor.userName,
        email: doctor.email,
        title: doctor.title || "",
        avatar: doctor.avatar || ""
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/appointments/ticket", async (req, res) => {
  try {
    const { roomId, appointment, patientName } = req.body || {};
    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }
    const room = await getRoomInfo(roomId).catch(() => null);
    recordAppointment({
      roomId,
      roomTitle: room?.title,
      patientName: patientName || appointment?.patientName,
      appointment,
      ticket: null
    });
    const file = await createAppointmentTicket({ roomId, appointment });
    const normalized = file
      ? {
          id: file.id,
          title: file.title,
          url: file.webUrl || file.viewUrl || file.url || null,
          shareToken: file.shareToken || null
        }
      : null;
    recordAppointment({
      roomId,
      roomTitle: room?.title,
      patientName: patientName || appointment?.patientName,
      appointment,
      ticket: normalized
    });
    return res.json({ file: normalized });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/contact-change-request", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const user = await getSelfProfileWithToken(auth);
    if (!user?.id) {
      return res.status(401).json({ error: "Unable to resolve user from token" });
    }

    const displayName =
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.userName ||
      user.email ||
      "Patient";

    const requestedRoomId = String(req.body?.roomId || "").trim();
    let patientRoomId = getPatientRoomIdByUserId(user.id);
    if (!patientRoomId) {
      const emailPrefix = user.email ? user.email.split("@")[0] : "";
      const candidates = [
        displayName ? `${displayName} - Patient Room` : "",
        user.userName ? `${user.userName} - Patient Room` : "",
        user.email ? `${user.email} - Patient Room` : "",
        emailPrefix ? `${emailPrefix} - Patient Room` : ""
      ];
      const room = await findRoomByCandidates(candidates, auth).catch(() => null);
      if (room?.id) {
        patientRoomId = room.id;
        recordPatientMapping({ userId: user.id, roomId: room.id, patientName: displayName });
      }
    }

    const roomId = String(patientRoomId || requestedRoomId || "").trim();
    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }

    const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
    const safeDate = new Date().toISOString().slice(0, 10);
    const safeName = String(displayName || "Patient").replace(/[^\p{L}\p{N}\s._-]+/gu, "").trim();
    const title = `Contact change request - ${safeDate}${safeName ? ` - ${safeName}` : ""}.docx`;

    const file = await createRoomDocument({
      roomId,
      folderTitle: "Contracts",
      title
    });

    return res.json({
      file: file
        ? {
            id: file.id,
            title: file.title,
            openUrl: file.webUrl || file.viewUrl || file.url || null,
            shareToken: file.shareToken || null
          }
        : null,
      payload
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/contracts/save", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const user = await getSelfProfileWithToken(auth);
    if (!user?.id) {
      return res.status(401).json({ error: "Unable to resolve user from token" });
    }

    const displayName =
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.userName ||
      user.email ||
      "Patient";

    const requestedRoomId = String(req.body?.roomId || "").trim();
    let patientRoomId = getPatientRoomIdByUserId(user.id);
    if (!patientRoomId) {
      const emailPrefix = user.email ? user.email.split("@")[0] : "";
      const candidates = [
        displayName ? `${displayName} - Patient Room` : "",
        user.userName ? `${user.userName} - Patient Room` : "",
        user.email ? `${user.email} - Patient Room` : "",
        emailPrefix ? `${emailPrefix} - Patient Room` : ""
      ];
      const room = await findRoomByCandidates(candidates, auth).catch(() => null);
      if (room?.id) {
        patientRoomId = room.id;
        recordPatientMapping({ userId: user.id, roomId: room.id, patientName: displayName });
      }
    }

    const roomId = String(patientRoomId || requestedRoomId || "").trim();
    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }

    const instanceFileId = String(req.body?.instanceFileId || "").trim();
    if (!instanceFileId) {
      return res.status(400).json({ error: "instanceFileId is required" });
    }

    const info = await getFileInfo(instanceFileId).catch(() => null);
    if (!info?.id) {
      return res.status(404).json({ error: "Source file not found" });
    }

    const contractsFolder = await ensureRoomFolderByTitle(roomId, "Contracts").catch(() => null);
    if (!contractsFolder?.id) {
      return res.status(404).json({ error: "Contracts folder not found" });
    }

    await copyFileToFolder({ fileId: instanceFileId, destFolderId: contractsFolder.id });

    const contents = await getFolderContents(contractsFolder.id).catch(() => null);
    const title = String(info?.title || "").trim();
    const files = (contents?.items || []).filter((item) => item?.type === "file");
    const matched = title ? files.filter((item) => String(item?.title || "").trim() === title) : [];
    const latest =
      (matched.length ? matched : files)
        .sort((a, b) => Number(a.id) - Number(b.id))
        .at(-1) || null;

    return res.json({
      folder: { id: contractsFolder.id, title: contractsFolder.title },
      file: latest
        ? {
            id: latest.id,
            title: latest.title,
            openUrl: latest.openUrl || latest.webUrl || latest.viewUrl || latest.url || null
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

router.post("/insurance-update-request", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const user = await getSelfProfileWithToken(auth);
    if (!user?.id) {
      return res.status(401).json({ error: "Unable to resolve user from token" });
    }

    const displayName =
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.userName ||
      user.email ||
      "Patient";

    const requestedRoomId = String(req.body?.roomId || "").trim();
    let patientRoomId = getPatientRoomIdByUserId(user.id);
    if (!patientRoomId) {
      const emailPrefix = user.email ? user.email.split("@")[0] : "";
      const candidates = [
        displayName ? `${displayName} - Patient Room` : "",
        user.userName ? `${user.userName} - Patient Room` : "",
        user.email ? `${user.email} - Patient Room` : "",
        emailPrefix ? `${emailPrefix} - Patient Room` : ""
      ];
      const room = await findRoomByCandidates(candidates, auth).catch(() => null);
      if (room?.id) {
        patientRoomId = room.id;
        recordPatientMapping({ userId: user.id, roomId: room.id, patientName: displayName });
      }
    }

    const roomId = String(patientRoomId || requestedRoomId || "").trim();
    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }

    const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
    const safeDate = new Date().toISOString().slice(0, 10);
    const safeName = String(displayName || "Patient").replace(/[^\p{L}\p{N}\s._-]+/gu, "").trim();
    const title = `Insurance update request - ${safeDate}${safeName ? ` - ${safeName}` : ""}.docx`;

    const file = await createRoomDocument({
      roomId,
      folderTitle: "Insurance",
      title
    });

    return res.json({
      file: file
        ? {
            id: file.id,
            title: file.title,
            openUrl: file.webUrl || file.viewUrl || file.url || null,
            shareToken: file.shareToken || null
          }
        : null,
      payload
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/sick-leave-request", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const user = await getSelfProfileWithToken(auth);
    if (!user?.id) {
      return res.status(401).json({ error: "Unable to resolve user from token" });
    }

    const displayName =
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.userName ||
      user.email ||
      "Patient";

    const requestedRoomId = String(req.body?.roomId || "").trim();
    let patientRoomId = getPatientRoomIdByUserId(user.id);
    if (!patientRoomId) {
      const emailPrefix = user.email ? user.email.split("@")[0] : "";
      const candidates = [
        displayName ? `${displayName} - Patient Room` : "",
        user.userName ? `${user.userName} - Patient Room` : "",
        user.email ? `${user.email} - Patient Room` : "",
        emailPrefix ? `${emailPrefix} - Patient Room` : ""
      ];
      const room = await findRoomByCandidates(candidates, auth).catch(() => null);
      if (room?.id) {
        patientRoomId = room.id;
        recordPatientMapping({ userId: user.id, roomId: room.id, patientName: displayName });
      }
    }

    const roomId = String(patientRoomId || requestedRoomId || "").trim();
    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }

    const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
    const safeDate = new Date().toISOString().slice(0, 10);
    const safeName = String(displayName || "Patient").replace(/[^\p{L}\p{N}\s._-]+/gu, "").trim();
    const title = `Sick leave request - ${safeDate}${safeName ? ` - ${safeName}` : ""}.docx`;

    const file = await createRoomDocument({
      roomId,
      folderTitle: "Sick Leave",
      title
    });

    return res.json({
      file: file
        ? {
            id: file.id,
            title: file.title,
            openUrl: file.webUrl || file.viewUrl || file.url || null,
            shareToken: file.shareToken || null
          }
        : null,
      payload
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

async function handleImagingNote(req, res) {
  try {
    return res.status(403).json({
      error: "Imaging notes must be created by the doctor."
    });
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const user = await getSelfProfileWithToken(auth);
    if (!user?.id) {
      return res.status(401).json({ error: "Unable to resolve user from token" });
    }

    const displayName =
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.userName ||
      user.email ||
      "Patient";

    const requestedRoomId = String(req.body?.roomId || "").trim();
    let patientRoomId = getPatientRoomIdByUserId(user.id);
    if (!patientRoomId) {
      const emailPrefix = user.email ? user.email.split("@")[0] : "";
      const candidates = [
        displayName ? `${displayName} - Patient Room` : "",
        user.userName ? `${user.userName} - Patient Room` : "",
        user.email ? `${user.email} - Patient Room` : "",
        emailPrefix ? `${emailPrefix} - Patient Room` : ""
      ];
      const room = await findRoomByCandidates(candidates, auth).catch(() => null);
      if (room?.id) {
        patientRoomId = room.id;
        recordPatientMapping({ userId: user.id, roomId: room.id, patientName: displayName });
      }
    }

    const roomId = String(patientRoomId || requestedRoomId || "").trim();
    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }

    const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
    const safeDate = new Date().toISOString().slice(0, 10);
    const safeName = String(displayName || "Patient").replace(/[^\p{L}\p{N}\s._-]+/gu, "").trim();
    const title = `Imaging note - ${safeDate}${safeName ? ` - ${safeName}` : ""}.docx`;

    const file = await createRoomDocument({
      roomId,
      folderTitle: "Imaging",
      title
    });

    return res.json({
      file: file
        ? {
            id: file.id,
            title: file.title,
            openUrl: file.webUrl || file.viewUrl || file.url || null,
            shareToken: file.shareToken || null
          }
        : null,
      payload
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
}

// Backwards compatible route name (kept for older UI builds).
router.post("/imaging-upload-request", handleImagingNote);
// Preferred route name.
router.post("/imaging-note", handleImagingNote);

router.post("/imaging/upload", async (req, res) => {
  try {
    return res.status(403).json({
      error: "Imaging files can only be uploaded by the doctor."
    });
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const user = await getSelfProfileWithToken(auth);
    if (!user?.id) {
      return res.status(401).json({ error: "Unable to resolve user from token" });
    }

    const displayName =
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.userName ||
      user.email ||
      "Patient";

    const requestedRoomId = String(req.body?.roomId || "").trim();
    let patientRoomId = getPatientRoomIdByUserId(user.id);
    if (!patientRoomId) {
      const emailPrefix = user.email ? user.email.split("@")[0] : "";
      const candidates = [
        displayName ? `${displayName} - Patient Room` : "",
        user.userName ? `${user.userName} - Patient Room` : "",
        user.email ? `${user.email} - Patient Room` : "",
        emailPrefix ? `${emailPrefix} - Patient Room` : ""
      ];
      const room = await findRoomByCandidates(candidates, auth).catch(() => null);
      if (room?.id) {
        patientRoomId = room.id;
        recordPatientMapping({ userId: user.id, roomId: room.id, patientName: displayName });
      }
    }

    const roomId = String(patientRoomId || requestedRoomId || "").trim();
    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }

    const file = req.body?.file && typeof req.body.file === "object" ? req.body.file : null;
    const fileName = String(file?.fileName || "").trim();
    const base64 = String(file?.base64 || "").trim();
    const contentType = String(file?.contentType || "application/octet-stream").trim();
    if (!fileName || !base64) {
      return res.status(400).json({ error: "file.fileName and file.base64 are required" });
    }

    const maxBytes = 15 * 1024 * 1024;
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > maxBytes) {
      return res.status(413).json({ error: `File too large (${buffer.length} bytes). Max is ${maxBytes} bytes.` });
    }

    const summary = await getRoomSummary(roomId, auth).catch(() => []);
    const imagingFolder =
      (summary || []).find((f) => String(f?.title || "").trim().toLowerCase() === "imaging") ||
      null;
    const folder =
      imagingFolder?.id
        ? { id: imagingFolder.id, title: imagingFolder.title }
        : await ensureRoomFolderByTitle(roomId, "Imaging").catch(() => null);
    if (!folder?.id) {
      return res.status(404).json({ error: "Imaging folder not found" });
    }

    const uploaded = await uploadFileToFolder(
      {
        folderId: folder.id,
        fileName,
        buffer,
        contentType
      },
      auth
    );

    const contents = await getFolderContents(folder.id, auth).catch(() => null);
    const uploadedFile =
      (contents?.items || [])
        .filter((item) => item?.type === "file")
        .filter((item) => String(item?.title || "").trim() === fileName)
        .sort((a, b) => Number(a.id) - Number(b.id))
        .at(-1) || null;

    return res.json({
      folder,
      uploaded,
      file: uploadedFile
        ? {
            id: uploadedFile.id,
            title: uploadedFile.title,
            openUrl: uploadedFile.openUrl || null
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

router.post("/fill-sign/complete", async (req, res) => {
  try {
    const { fileId } = req.body || {};
    if (!fileId) {
      return res.status(400).json({ error: "fileId is required" });
    }
    // Form Filling rooms handle completion and folder moves automatically.
    // We keep this endpoint for backwards compatibility with the UI.
    return res.json({ ok: true, note: "Completion is handled by DocSpace (form filling workflow)." });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/fill-sign/contents", async (req, res) => {
  try {
    const tab = String(req.query.tab || "action").toLowerCase();
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }
    const user = await getSelfProfileWithToken(auth);
    if (!user?.id) {
      return res.status(401).json({ error: "Unable to resolve user from token" });
    }

    const displayName =
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.userName ||
      user.email ||
      "";

    let patientRoomId = getPatientRoomIdByUserId(user.id);
    if (!patientRoomId) {
      const emailPrefix = user.email ? user.email.split("@")[0] : "";
      const candidates = [
        displayName ? `${displayName} - Patient Room` : "",
        user.userName ? `${user.userName} - Patient Room` : "",
        user.email ? `${user.email} - Patient Room` : "",
        emailPrefix ? `${emailPrefix} - Patient Room` : ""
      ];
      const room = await findRoomByCandidates(candidates, auth).catch(() => null);
      if (room?.id) {
        patientRoomId = room.id;
        recordPatientMapping({ userId: user.id, roomId: room.id, patientName: displayName });
      }
    }
    if (!patientRoomId) {
      return res.json({ contents: { items: [] }, source: "assignments", note: "patient-room-not-resolved" });
    }

    const assignments = listFillSignAssignmentsForRoom(patientRoomId).filter(
      (item) => String(item?.state || "active") === "active"
    );
    const files = await resolveFillSignAssignments(assignments, { patientName: displayName });
    const filtered = files.filter((file) =>
      tab === "completed" ? file.status === "completed" : file.status !== "completed"
    );

    return res.json({
      patientRoomId: String(patientRoomId),
      contents: { items: filtered },
      source: "assignments"
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/fill-sign/cancel", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const user = await getSelfProfileWithToken(auth);
    if (!user?.id) {
      return res.status(401).json({ error: "Unable to resolve user from token" });
    }

    const assignmentId = String(req.body?.assignmentId || req.body?.id || "").trim();
    if (!assignmentId) {
      return res.status(400).json({ error: "assignmentId is required" });
    }

    let patientRoomId = getPatientRoomIdByUserId(user.id);
    if (!patientRoomId) {
      const displayName =
        user.displayName ||
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.userName ||
        user.email ||
        "";
      const emailPrefix = user.email ? user.email.split("@")[0] : "";
      const candidates = [
        displayName ? `${displayName} - Patient Room` : "",
        user.userName ? `${user.userName} - Patient Room` : "",
        user.email ? `${user.email} - Patient Room` : "",
        emailPrefix ? `${emailPrefix} - Patient Room` : ""
      ];
      const room = await findRoomByCandidates(candidates, auth).catch(() => null);
      if (room?.id) {
        patientRoomId = room.id;
        recordPatientMapping({ userId: user.id, roomId: room.id, patientName: displayName });
      }
    }
    if (!patientRoomId) return res.status(400).json({ error: "Patient room is missing" });

    const assignments = listFillSignAssignmentsForRoom(patientRoomId);
    const target = assignments.find((item) => String(item?.id || "") === assignmentId) || null;
    if (!target) {
      return res.status(404).json({ error: "Assignment not found" });
    }
    if (String(target?.initiatedBy || "") !== "patient") {
      return res.status(403).json({ error: "Only patient-initiated statements can be canceled by the patient." });
    }

    const updated = setFillSignAssignmentState({
      patientRoomId: String(patientRoomId),
      assignmentId,
      state: "canceled",
      actor: user?.email || user?.displayName || "patient"
    });

    return res.json({ ok: Boolean(updated) });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/fill-sign/decline", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const user = await getSelfProfileWithToken(auth);
    if (!user?.id) {
      return res.status(401).json({ error: "Unable to resolve user from token" });
    }

    const assignmentId = String(req.body?.assignmentId || req.body?.id || "").trim();
    if (!assignmentId) {
      return res.status(400).json({ error: "assignmentId is required" });
    }

    let patientRoomId = getPatientRoomIdByUserId(user.id);
    if (!patientRoomId) {
      const displayName =
        user.displayName ||
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.userName ||
        user.email ||
        "";
      const emailPrefix = user.email ? user.email.split("@")[0] : "";
      const candidates = [
        displayName ? `${displayName} - Patient Room` : "",
        user.userName ? `${user.userName} - Patient Room` : "",
        user.email ? `${user.email} - Patient Room` : "",
        emailPrefix ? `${emailPrefix} - Patient Room` : ""
      ];
      const room = await findRoomByCandidates(candidates, auth).catch(() => null);
      if (room?.id) {
        patientRoomId = room.id;
        recordPatientMapping({ userId: user.id, roomId: room.id, patientName: displayName });
      }
    }
    if (!patientRoomId) return res.status(400).json({ error: "Patient room is missing" });

    const assignments = listFillSignAssignmentsForRoom(patientRoomId);
    const target = assignments.find((item) => String(item?.id || "") === assignmentId) || null;
    if (!target) {
      return res.status(404).json({ error: "Assignment not found" });
    }
    if (String(target?.initiatedBy || "") !== "clinic") {
      return res.status(403).json({ error: "Only clinic-initiated requests can be declined by the patient." });
    }

    const updated = setFillSignAssignmentState({
      patientRoomId: String(patientRoomId),
      assignmentId,
      state: "declined",
      actor: user?.email || user?.displayName || "patient"
    });

    return res.json({ ok: Boolean(updated) });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/fill-sign/client-templates", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const user = await getSelfProfileWithToken(auth);
    if (!user?.id) {
      return res.status(401).json({ error: "Unable to resolve user from token" });
    }

    const { room, folder, files } = await loadClientTemplates();
    if (!folder?.id) {
      return res.status(404).json({
        error: `Client templates folder not found: ${String(config.clientTemplatesFolderTitle || "Client Templates")}. Set DOCSPACE_CLIENT_TEMPLATES_FOLDER_ID to use an exact folder ID.`
      });
    }

    return res.json({
      room: room?.id ? { id: room.id, title: room.title } : null,
      folder: folder?.id ? { id: folder.id, title: folder.title } : null,
      files
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/fill-sign/request", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const user = await getSelfProfileWithToken(auth);
    if (!user?.id) {
      return res.status(401).json({ error: "Unable to resolve user from token" });
    }

    const templateFileId = String(req.body?.templateFileId || req.body?.fileId || "").trim();
    if (!templateFileId) {
      return res.status(400).json({ error: "templateFileId is required" });
    }

    const displayName =
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.userName ||
      user.email ||
      "Patient";

    let patientRoomId = getPatientRoomIdByUserId(user.id);
    if (!patientRoomId) {
      const emailPrefix = user.email ? user.email.split("@")[0] : "";
      const candidates = [
        displayName ? `${displayName} - Patient Room` : "",
        user.userName ? `${user.userName} - Patient Room` : "",
        user.email ? `${user.email} - Patient Room` : "",
        emailPrefix ? `${emailPrefix} - Patient Room` : ""
      ];
      const room = await findRoomByCandidates(candidates, auth).catch(() => null);
      if (room?.id) {
        patientRoomId = room.id;
        recordPatientMapping({ userId: user.id, roomId: room.id, patientName: displayName });
      }
    }
    if (!patientRoomId) {
      return res.status(400).json({ error: "Patient room is missing" });
    }

    const { room: sourceRoom, folder, files } = await loadClientTemplates();
    if (!folder?.id) {
      return res.status(404).json({
        error: `Client templates folder not found: ${String(config.clientTemplatesFolderTitle || "Client Templates")}. Set DOCSPACE_CLIENT_TEMPLATES_FOLDER_ID to use an exact folder ID.`
      });
    }

    const template = files.find((item) => String(item.id) === templateFileId) || null;
    if (!template) {
      return res.status(404).json({ error: "Template file not found in Client Templates" });
    }

    // Client templates live in a regular room ("Medicine Templates"). For Fill & Sign we need templates
    // to be in a Form Filling room. Copy the selected file into the Forms room Templates folder.
    const ensured = await ensureTemplateInFormsRoom({
      sourceFileId: templateFileId,
      sourceTitle: template.title
    });
    const formsRoom = ensured.formsRoom;
    const formsTemplateFileId = ensured.templateFileId;

    // Match doctor flow: create/use an external FillForms link using admin token.
    // (User tokens often cannot manage external links reliably.)
    const fillLink =
      (await getFillOutLink(formsTemplateFileId).catch(() => null)) ||
      (await ensureExternalLinkAccess(formsTemplateFileId, { access: "FillForms", title: "Link to fill out" }).catch(
        () => null
      )) ||
      (await setFileExternalLink(formsTemplateFileId, "", { access: "ReadWrite" }).catch(() => null));
    if (!fillLink?.shareLink) {
      return res.status(500).json({ error: "Unable to obtain fill-out link for template" });
    }

    const assignment = recordFillSignAssignment({
      assignmentId: randomUUID(),
      patientRoomId: String(patientRoomId),
      patientId: user.id ? String(user.id) : null,
      patientName: displayName || null,
      templateFileId: formsTemplateFileId,
      templateTitle: template.title,
      requestedBy: displayName || user.email || "patient",
      initiatedBy: "patient",
      medicalRoomId: formsRoom?.id ? String(formsRoom.id) : null,
      shareLink: fillLink.shareLink,
      shareToken: fillLink.requestToken || fillLink.shareToken || null
    });

    return res.json({
      assignment: assignment ? { id: assignment.id, createdAt: assignment.createdAt } : null,
      template,
      source: sourceRoom?.id ? { roomId: sourceRoom.id, folderId: folder.id } : { folderId: folder.id },
      link: fillLink?.shareLink || null
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/room-news", async (req, res) => {
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
    const folders = await Promise.all(
      (summary || []).map(async (folder) => {
        try {
          const items = await getNewFolderItems(folder.id, auth);
          return {
            id: folder.id,
            title: folder.title,
            items
          };
        } catch (error) {
          return {
            id: folder.id,
            title: folder.title,
            items: [],
            error: error.message
          };
        }
      })
    );
    return res.json({ folders });
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
    console.log("[update-profile] applied", {
      userId,
      firstName: user?.firstName,
      lastName: user?.lastName,
      email: user?.email,
      mobilePhone: user?.mobilePhone
    });
    const room = roomId ? await getRoomInfo(roomId) : null;
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

export default router;
