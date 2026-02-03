import { Router } from "express";
import {
  createPatientRoom,
  createPatientFolders,
  getRoomSummary,
  getFolderContents,
  getNewFolderItems,
  findRoomByCandidates,
  getSelfProfileWithToken,
  updateMember,
  getRoomInfo,
  getDoctorProfile,
  createAppointmentTicket,
  setFileExternalLink
} from "../docspaceClient.js";
import {
  getPatientRoomIdByUserId,
  listFillSignAssignmentsForRoom,
  recordAppointment,
  recordPatientMapping,
  listMedicalRecords
} from "../store.js";
import { config } from "../config.js";
import { resolveFillSignAssignments } from "../fillSignStatus.js";

const router = Router();

router.post("/bootstrap", async (req, res) => {
  const { fullName } = req.body;
  const room = await createPatientRoom({ fullName });
  const folders = await createPatientFolders({ roomId: room.id });
  res.json({ room, folders });
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

    const assignments = listFillSignAssignmentsForRoom(patientRoomId);
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
