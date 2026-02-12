import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  copyFileToFolder,
  createRoomDocument,
  ensureRoomFolderByTitle,
  findRoomByCandidates,
  getDoctorProfile,
  getFileInfo,
  getFolderContents,
  getFolderByTitleWithin,
  getFormsRoomFolders,
  requireFormsRoom,
  getRoomFolderByTitle,
  getRoomInfo,
  getRoomSummary,
  listRooms,
  requireLabRoom,
  createRoomFileFromTemplate,
  getFillOutLink,
  ensureExternalLinkAccess,
  setFileExternalLink,
  startFilling
} from "../docspaceClient.js";
import {
  closeAppointment,
  listAppointments,
  listFillSignAssignmentsForRoom,
  recordFillSignAssignment,
  recordMedicalRecord
} from "../store.js";
import { config } from "../config.js";
import { resolveFillSignAssignments } from "../fillSignStatus.js";

const router = Router();

const patientRoomSuffix = " - Patient Room";

function normalizeAuthHeader(value) {
  if (!value) return "";
  if (value.startsWith("Bearer ") || value.startsWith("Basic ") || value.startsWith("ASC ")) {
    return value;
  }
  return `Bearer ${value}`;
}

function isPatientRoom(title) {
  return String(title || "").endsWith(patientRoomSuffix);
}

function patientNameFromRoom(title) {
  const value = String(title || "");
  return isPatientRoom(value) ? value.slice(0, -patientRoomSuffix.length) : value;
}

function normalizeFolderTitle(value) {
  return String(value || "").trim().toLowerCase();
}

const allowedFolderTitles = new Map(
  [
    "Personal Data",
    "Contracts",
    "Lab Results",
    "Medical Records",
    "Appointments",
    "Sick Leave",
    "Insurance",
    "Prescriptions",
    "Imaging"
  ].map((title) => [normalizeFolderTitle(title), title])
);

router.get("/session", async (_req, res) => {
  try {
    const doctor = await getDoctorProfile();
    if (!doctor) {
      return res.status(404).json({ error: "Doctor is not configured" });
    }
    const token = normalizeAuthHeader(config.rawAuthToken || "");
    return res.json({
      doctor: {
        id: doctor.id,
        displayName: doctor.displayName || doctor.userName,
        email: doctor.email,
        title: doctor.title || "",
        avatar: doctor.avatar || "",
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

router.get("/rooms", async (_req, res) => {
  try {
    const rooms = await listRooms();
    const lastByRoomId = new Map();
    for (const appt of listAppointments()) {
      const roomId = String(appt.roomId || "");
      if (!roomId) continue;
      const key = `${appt.date || ""} ${appt.time || ""}`.trim();
      const prev = lastByRoomId.get(roomId);
      if (!prev || key.localeCompare(prev.key) > 0) {
        lastByRoomId.set(roomId, { key, date: appt.date || "", time: appt.time || "" });
      }
    }
    const patientRooms = (rooms || [])
      .filter((room) => isPatientRoom(room.title))
      .map((room) => ({
        id: room.id,
        title: room.title,
        patientName: patientNameFromRoom(room.title),
        url: room.webUrl || room.shortWebUrl || null,
        lastVisit: lastByRoomId.get(String(room.id))?.date || null
      }))
      .sort((a, b) => a.patientName.localeCompare(b.patientName));
    return res.json({ rooms: patientRooms });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/rooms/:roomId/folder-contents", async (req, res) => {
  try {
    const { roomId } = req.params;
    const title = String(req.query.title || "").trim();
    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }
    let folder = await getRoomFolderByTitle(roomId, title);
    if (!folder?.id) {
      const summary = await getRoomSummary(roomId);
      const target = title.toLowerCase();
      const fallback = summary.find((item) =>
        String(item.title || "").toLowerCase().includes(target)
      );
      if (fallback?.id) {
        folder = { id: fallback.id, title: fallback.title };
      }
    }
    if (!folder?.id) {
      return res.status(404).json({ error: `Folder not found: ${title}` });
    }
    const contents = await getFolderContents(folder.id);
    return res.json({ contents, folder });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/rooms/:roomId/summary", async (req, res) => {
  try {
    const { roomId } = req.params;
    const summary = await getRoomSummary(roomId);
    return res.json({ summary });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/rooms/:roomId/fill-sign/contents", async (req, res) => {
  try {
    const { roomId } = req.params;
    const tab = String(req.query.tab || "action").toLowerCase();
    const assignments = listFillSignAssignmentsForRoom(roomId);
    const room = await getRoomInfo(roomId).catch(() => null);
    const patientName = patientNameFromRoom(room?.title || "") || "";
    const files = await resolveFillSignAssignments(assignments, { patientName });
    const filtered = files.filter((file) =>
      tab === "completed" ? file.status === "completed" : file.status !== "completed"
    );

    return res.json({
      contents: { items: filtered },
      patientRoomId: String(roomId),
      source: "assignments"
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/appointments", (req, res) => {
  const date = req.query.date;
  const items = listAppointments({ date });
  return res.json({ appointments: items });
});

router.get("/templates/files", async (_req, res) => {
  try {
    const room = await requireFormsRoom();
    const folders = await getFormsRoomFolders(room.id).catch(() => null);
    const templatesFolder = folders?.templates || null;
    const listFromId = templatesFolder?.id ? templatesFolder.id : room.id;
    const contents = await getFolderContents(listFromId);
    const files = (contents?.items || [])
      .filter((item) => item.type === "file")
      .map((item) => ({
        id: item.id,
        title: item.title
      }));
    return res.json({
      room: { id: room.id, title: room.title },
      templatesFolder: templatesFolder?.id
        ? { id: templatesFolder.id, title: templatesFolder.title }
        : null,
      files
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/lab/files", async (_req, res) => {
  try {
    const room = await requireLabRoom();
    const contents = await getFolderContents(room.id);
    const files = (contents?.items || [])
      .filter((item) => item.type === "file")
      .map((item) => ({
        id: item.id,
        title: item.title
      }));
    return res.json({
      room: { id: room.id, title: room.title },
      files
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/rooms/:roomId/documents", async (req, res) => {
  try {
    const { roomId } = req.params;
    const rawFolderTitle = String(req.body?.folderTitle || "").trim();
    const title = String(req.body?.title || "").trim();
    if (!rawFolderTitle) {
      return res.status(400).json({ error: "folderTitle is required" });
    }
    const folderTitle = allowedFolderTitles.get(normalizeFolderTitle(rawFolderTitle)) || "";
    if (!folderTitle) {
      return res.status(400).json({ error: `Unsupported folderTitle: ${rawFolderTitle}` });
    }
    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    const safeTitle = title.toLowerCase().endsWith(".docx") ? title : `${title}.docx`;
    const file = await createRoomDocument({ roomId, folderTitle, title: safeTitle });
    return res.json({
      file: file
        ? {
            id: file.id,
            title: file.title,
            openUrl: file.webUrl || file.viewUrl || file.url || null,
            shareToken: file.shareToken || null
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

router.post("/rooms/:roomId/lab-result/copy", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { fileId, title } = req.body || {};
    if (!fileId) {
      return res.status(400).json({ error: "fileId is required" });
    }
    const labFolder = await ensureRoomFolderByTitle(roomId, "Lab Results");
    if (!labFolder?.id) {
      return res.status(404).json({ error: "Lab Results folder not found" });
    }
    const safeTitle = String(title || "").trim();
    const fileInfo = await getFileInfo(String(fileId)).catch(() => null);
    const originalTitle = String(fileInfo?.title || "");
    const extMatch = originalTitle.match(/\.[a-z0-9]+$/i);
    const extension = extMatch ? extMatch[0] : "";
    const destTitle = safeTitle
      ? extension && !safeTitle.toLowerCase().endsWith(extension.toLowerCase())
        ? `${safeTitle}${extension}`
        : safeTitle
      : undefined;
    await copyFileToFolder({
      fileId: String(fileId),
      destFolderId: labFolder.id
    });
    const contents = await getFolderContents(labFolder.id);
    const files = (contents?.items || []).filter((item) => item.type === "file");
    const latest = files.find((item) => String(item.id) !== String(fileId)) || files[0] || null;
    return res.json({ file: latest });
  } catch (error) {
    console.error("[doctor folder-contents]", error?.message || error, error?.details || "");
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/rooms/:roomId/lab-result", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { title, description } = req.body || {};
    const safeTitle = String(title || "Lab result").trim();
    const docTitle = `${safeTitle}.docx`;
    const file = await createRoomDocument({ roomId, folderTitle: "Lab Results", title: docTitle });
    return res.json({
      file: file
        ? {
            id: file.id,
            title: file.title,
            url: file.webUrl || file.viewUrl || file.url || null,
            shareToken: file.shareToken || null,
            description: description || ""
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

router.post("/rooms/:roomId/prescription", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { medication, dosage, instructions } = req.body || {};
    const med = String(medication || "Prescription").trim();
    const date = new Date().toISOString().slice(0, 10);
    const docTitle = `Prescription ${date} - ${med}.docx`;
    const file = await createRoomDocument({ roomId, folderTitle: "Prescriptions", title: docTitle });
    return res.json({
      file: file
        ? {
            id: file.id,
            title: file.title,
            url: file.webUrl || file.viewUrl || file.url || null,
            shareToken: file.shareToken || null
          }
        : null,
      payload: {
        medication: med,
        dosage: dosage || "",
        instructions: instructions || "",
        date
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/rooms/:roomId/medical-record", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { appointmentId, date, patientName: patientNameOverride } = req.body || {};
    const safeDate = String(date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const room = await getRoomInfo(roomId).catch(() => null);
    const patientName =
      String(patientNameOverride || "").trim() ||
      patientNameFromRoom(room?.title || "") ||
      "Patient";

    const templateId = String(config.medicalRecordTemplateId || "3174060");
    const templateInfo = await getFileInfo(templateId).catch(() => null);
    const ext =
      String(templateInfo?.fileExst || "").trim() ||
      (templateInfo?.isForm ? ".pdf" : "") ||
      (String(templateInfo?.title || "").match(/\.[a-z0-9]+$/i)?.[0] || ".pdf");
    const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
    const destTitle = `Medical Record - ${safeDate} - ${patientName}${safeExt}`;
    const file = await createRoomFileFromTemplate({
      roomId,
      folderTitle: "Medical Records",
      templateFileId: templateId,
      title: destTitle
    });

    if (appointmentId) {
      closeAppointment(appointmentId);
    }

    const createdFileId = file?.id ? String(file.id) : "";
    if (createdFileId) {
      await startFilling(createdFileId).catch(() => null);
    }
    const fillLink =
      (createdFileId ? await getFillOutLink(createdFileId).catch(() => null) : null) ||
      (createdFileId ? await ensureExternalLinkAccess(createdFileId, { access: "FillForms" }).catch(() => null) : null) ||
      (createdFileId ? await setFileExternalLink(createdFileId, "", { access: "FillForms" }).catch(() => null) : null);
    const fillUrl = createdFileId
      ? `${config.baseUrl}/doceditor?fileId=${encodeURIComponent(createdFileId)}&action=fill`
      : null;

    return res.json({
      file: file
        ? {
            id: file.id,
            title: file.title,
            openUrl: fillUrl || fillLink?.shareLink || file.webUrl || null,
            shareToken: fillLink?.requestToken || fillLink?.shareToken || file.shareToken || null
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

router.post("/rooms/:roomId/fill-sign/request", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { fileId } = req.body || {};
    if (!fileId) {
      return res.status(400).json({ error: "fileId is required" });
    }

    const patientRoom = await getRoomInfo(roomId).catch(() => null);
    const patientName = patientNameFromRoom(patientRoom?.title || "") || "";

    const templateInfo = await getFileInfo(String(fileId)).catch(() => null);
    if (!templateInfo?.id) {
      return res.status(404).json({ error: "Template file not found" });
    }

    const fillLink =
      (await getFillOutLink(String(fileId)).catch(() => null)) ||
      (await setFileExternalLink(String(fileId), "", { access: "ReadWrite" }).catch(() => null));

    if (!fillLink?.shareLink) {
      return res.status(500).json({ error: "Unable to obtain public link to fill out" });
    }

    const formsRoom = await requireFormsRoom().catch(() => null);
    const assignment = recordFillSignAssignment({
      assignmentId: randomUUID(),
      patientRoomId: String(roomId),
      patientName,
      templateFileId: String(fileId),
      templateTitle: templateInfo.title || null,
      requestedBy: config.doctorEmail || null,
      medicalRoomId: formsRoom?.id ? String(formsRoom.id) : null,
      shareLink: fillLink.shareLink,
      shareToken: fillLink.requestToken || fillLink.shareToken || null
    });

    return res.json({
      files: [
        {
          type: "file",
          id: templateInfo.id,
          title: templateInfo.title,
          openUrl: fillLink.shareLink,
          assignmentId: assignment?.id || null
        }
      ],
      patientRoomId: String(roomId),
      room: formsRoom?.id ? { id: formsRoom.id, title: formsRoom.title } : null,
      source: "assignments"
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

export default router;
