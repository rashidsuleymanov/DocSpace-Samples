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
  getRoomFolderByTitle,
  getRoomSummary,
  listRooms
} from "../docspaceClient.js";
import { closeAppointment, listAppointments, recordMedicalRecord } from "../store.js";
import { config } from "../config.js";

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
    const fillFolder = await getRoomFolderByTitle(roomId, "Fill & Sign");
    if (!fillFolder?.id) {
      return res.status(404).json({ error: "Fill & Sign folder not found" });
    }
    const targetTitle = tab === "completed" ? "Complete" : "In Process";
    const subfolder = await getFolderByTitleWithin(fillFolder.id, targetTitle);
    if (!subfolder?.id) {
      return res.status(404).json({ error: `Folder not found: ${targetTitle}` });
    }
    const contents = await getFolderContents(subfolder.id);
    return res.json({ contents, folder: subfolder, fillFolder });
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
    const room = await findRoomByCandidates(["Medicine Templates", "Medical Templates"]);
    if (!room?.id) {
      return res.status(404).json({ error: "Templates room not found" });
    }
    const contents = await getFolderContents(room.id);
    const files = (contents?.items || []).filter((item) => item.type === "file");
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
    const { appointmentId, type, title, date, doctorName, summary } = req.body || {};
    const safeDate = String(date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const recordType = String(type || "Visit note").trim();
    const recordTitle = String(title || `Medical record ${safeDate}`).trim();
    const docTitle = `${recordTitle}.docx`;
    const file = await createRoomDocument({ roomId, folderTitle: "Medical Records", title: docTitle });
    const normalizedFile = file
      ? {
          id: file.id,
          title: file.title,
          url: file.webUrl || file.viewUrl || file.url || null,
          shareToken: file.shareToken || null
        }
      : null;
    const record = recordMedicalRecord({
      id: randomUUID(),
      roomId,
      appointmentId: appointmentId || null,
      date: safeDate,
      type: recordType,
      title: recordTitle,
      doctor: doctorName || "Doctor",
      description: summary || "",
      status: "Active",
      document: normalizedFile
    });
    if (appointmentId) {
      closeAppointment(appointmentId);
    }
    return res.json({ record });
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
    const fillFolder = await getRoomFolderByTitle(roomId, "Fill & Sign");
    if (!fillFolder?.id) {
      return res.status(404).json({ error: "Fill & Sign folder not found" });
    }
    const inProcess = await getFolderByTitleWithin(fillFolder.id, "In Process");
    if (!inProcess?.id) {
      return res.status(404).json({ error: "In Process folder not found" });
    }
    await copyFileToFolder({
      fileId: String(fileId),
      destFolderId: inProcess.id
    });
    const contents = await getFolderContents(inProcess.id);
    const files = (contents?.items || []).filter((item) => item.type === "file");
    return res.json({ files });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

export default router;
