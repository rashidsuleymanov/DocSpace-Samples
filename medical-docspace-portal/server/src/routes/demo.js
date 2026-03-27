import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import {
  authenticateUser,
  copyFileToFolder,
  createDocSpaceUser,
  createPatientFolders,
  createPatientRoom,
  createRoomFileFromTemplate,
  ensureExternalLinkAccess,
  getFileInfo,
  getFillOutLink,
  getFolderByTitleWithin,
  getFolderContents,
  getFormsRoomFolders,
  requireFormsRoom,
  getRoomInfo,
  setFileExternalLink,
  shareRoom
} from "../docspaceClient.js";
import { config } from "../config.js";
import { recordFillSignAssignment, recordPatientMapping, hasFillSignAssignmentForRoomTemplate } from "../store.js";
import {
  clearDemoSessionCookie,
  createDemoSession,
  deleteDemoSession,
  listDemoSessions,
  setDemoSessionCookie
} from "../demoSessionStore.js";
import { cleanupDemoSession } from "./demoCleanup.js";

const router = Router();

// In-memory rate limiter: max 5 demo starts per IP per 60 s.
const _startAttempts = new Map();
function checkStartRateLimit(ip) {
  const key = String(ip || "unknown");
  const now = Date.now();
  const windowMs = 60_000;
  const max = 5;
  if (_startAttempts.size > 5000) _startAttempts.clear();
  const timestamps = (_startAttempts.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= max) return false;
  timestamps.push(now);
  _startAttempts.set(key, timestamps);
  return true;
}
const DEMO_DOCTOR_FIRST_NAMES = [
  "Sarah",
  "Emily",
  "Olivia",
  "Sophia",
  "Mia",
  "Ava",
  "Charlotte",
  "Amelia",
  "Grace",
  "Hannah",
  "Natalie",
  "Claire"
];
const DEMO_DOCTOR_LAST_NAMES = [
  "Mitchell",
  "Carter",
  "Bennett",
  "Reed",
  "Hayes",
  "Turner",
  "Parker",
  "Brooks",
  "Foster",
  "Morris",
  "Hughes",
  "Sullivan"
];

function normalizeEmailDomain(value) {
  const raw = String(value || "").trim();
  if (!raw) return "demo.local";
  return raw.replace(/^@+/, "");
}

// Cryptographically secure pick using rejection sampling to avoid modulo bias.
function securePick(set) {
  const limit = 256 - (256 % set.length);
  let byte;
  do {
    [byte] = randomBytes(1);
  } while (byte >= limit);
  return set[byte % set.length];
}

function secureRandInt(max) {
  if (max <= 1) return 0;
  const limit = 256 - (256 % max);
  let byte;
  do {
    [byte] = randomBytes(1);
  } while (byte >= limit);
  return byte % max;
}

function randomPassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%^&*()-_=+[]{}";
  const all = upper + lower + digits + special;

  const length = 16;
  const chars = [securePick(upper), securePick(lower), securePick(digits), securePick(special)];
  while (chars.length < length) {
    chars.push(securePick(all));
  }
  // Fisher-Yates shuffle with cryptographic RNG
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = secureRandInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function buildEmail({ sessionId, role }) {
  const domain = normalizeEmailDomain(process.env.DEMO_EMAIL_DOMAIN || "demo.local");
  const slug = String(sessionId || "").replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase() || "demo";
  const r = String(role || "user").toLowerCase();
  return `demo+${slug}-${r}@${domain}`;
}

function sanitizeNameParts(value, fallbackFirst, fallbackLast) {
  const raw = String(value || "").trim();
  const cleaned = raw.replace(/[^A-Za-z\s-]/g, " ").replace(/\s+/g, " ").trim();
  const parts = cleaned.split(" ").filter(Boolean);
  const firstName = parts[0] || fallbackFirst;
  const lastName = parts.slice(1).join(" ") || fallbackLast;
  return { firstName, lastName };
}

function buildSafeFullName(input, fallbackFirst, fallbackLast) {
  const parts = sanitizeNameParts(input, fallbackFirst, fallbackLast);
  return `${parts.firstName} ${parts.lastName}`.trim();
}

function hashSeed(value) {
  const raw = String(value || "");
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function doctorDisplayNameOf(session) {
  const displayName = String(session?.doctor?.user?.displayName || "").trim();
  if (displayName) return displayName;
  const firstName = String(session?.doctor?.user?.firstName || "").trim();
  const lastName = String(session?.doctor?.user?.lastName || "").trim();
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function buildDemoDoctorName(sessionId) {
  const used = new Set(
    listDemoSessions()
      .map(doctorDisplayNameOf)
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );

  const total = DEMO_DOCTOR_FIRST_NAMES.length * DEMO_DOCTOR_LAST_NAMES.length;
  const base = hashSeed(sessionId);
  for (let offset = 0; offset < total; offset += 1) {
    const index = (base + offset) % total;
    const firstName = DEMO_DOCTOR_FIRST_NAMES[index % DEMO_DOCTOR_FIRST_NAMES.length];
    const lastName = DEMO_DOCTOR_LAST_NAMES[Math.floor(index / DEMO_DOCTOR_FIRST_NAMES.length)];
    const fullName = `${firstName} ${lastName}`;
    if (!used.has(fullName)) {
      return fullName;
    }
  }
  return "Sarah Mitchell";
}

function asDoctorDisplayName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Dr. Sarah Mitchell";
  return /^dr\.\s/i.test(raw) ? raw : `Dr. ${raw}`;
}

function userSafeProfile(user, options = {}) {
  if (!user) return null;
  const displayName =
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.userName ||
    user.email;
  return {
    id: user.id,
    displayName: options.isDoctor ? asDoctorDisplayName(displayName) : displayName,
    email: user.email || "",
    title: user.title || (options.isDoctor ? "Demo doctor" : "")
  };
}

function roomSafe(room) {
  if (!room?.id) return null;
  return {
    id: room.id,
    title: room.title || room.name || "Patient Room",
    webUrl: room.webUrl || room.shortWebUrl || null
  };
}

async function copyTemplateIntoRoom({ roomId, folderTitle, templateFileId, titleBase }) {
  const fid = String(templateFileId || "").trim();
  if (!fid) return null;
  const info = await getFileInfo(fid).catch(() => null);
  if (!info?.id) {
    throw new Error(`Template file not found: ${fid}`);
  }
  const ext =
    String(info?.fileExst || "").trim() ||
    (String(info?.title || "").match(/\.[a-z0-9]+$/i)?.[0] || "");
  const safeTitleBase = String(titleBase || "").trim();
  const desiredTitle = safeTitleBase ? `${safeTitleBase}${ext}` : undefined;
  return createRoomFileFromTemplate({
    roomId,
    folderTitle,
    templateFileId: fid,
    title: desiredTitle
  });
}

async function ensureContractTemplateInRoom({ roomId, fullName } = {}) {
  const templateId = String(config.templateContractId || "").trim();
  const rid = String(roomId || "").trim();
  if (!templateId || !rid) return false;
  const templateInfo = await getFileInfo(templateId).catch(() => null);
  if (!templateInfo?.id) return false;
  const folder = await getFolderByTitleWithin(rid, "Contracts").catch(() => null);
  if (!folder?.id) return false;
  const contents = await getFolderContents(folder.id).catch(() => null);
  const hasAnyFile = Boolean((contents?.items || []).some((item) => item?.type === "file"));
  if (hasAnyFile) return true;
  await copyTemplateIntoRoom({
    roomId: rid,
    folderTitle: "Contracts",
    templateFileId: templateId,
    titleBase: fullName ? `Contract - ${fullName}` : "Contract"
  });
  return true;
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

  // Copy template into the Forms room Templates folder. Required for Fill & Sign workflow.
  await copyFileToFolder({ fileId: fid, destFolderId: templatesFolderId, toFillOut: true });

  const after = await getFolderContents(templatesFolderId).catch(() => null);
  const created =
    (after?.items || []).find((i) => i?.type === "file" && i?.id && !beforeIds.has(String(i.id))) || null;
  const createdId = created?.id ? String(created.id) : "";
  if (!createdId) {
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

async function ensureFillSignAssignmentFromTemplate({ userId, fullName, roomId, templateId, requestedByLabel } = {}) {
  const sourceId = String(templateId || "").trim();
  if (!sourceId) return false;
  if (!roomId) return false;
  if (hasFillSignAssignmentForRoomTemplate({ patientRoomId: roomId, templateFileId: sourceId })) {
    return true;
  }

  const templateInfo = await getFileInfo(sourceId).catch(() => null);
  if (!templateInfo?.id) return false;
  const ensured = await ensureTemplateInFormsRoom({
    sourceFileId: sourceId,
    sourceTitle: templateInfo?.title || ""
  }).catch(() => null);
  const formsTemplateId = ensured?.templateFileId || sourceId;
  if (hasFillSignAssignmentForRoomTemplate({ patientRoomId: roomId, templateFileId: formsTemplateId })) {
    return true;
  }

  const desiredTitle = "Link to fill out";
  let fillLink = await getFillOutLink(formsTemplateId).catch(() => null);
  const needsFillOutTitle = !String(fillLink?.title || "").toLowerCase().includes("fill out");
  if (!fillLink?.shareLink || needsFillOutTitle) {
    fillLink =
      (await ensureExternalLinkAccess(formsTemplateId, { access: "FillForms", title: desiredTitle }).catch(() => null)) ||
      (await setFileExternalLink(formsTemplateId, "", { access: "FillForms" }).catch(() => null)) ||
      fillLink;
  }
  if (!fillLink?.shareLink) {
    fillLink =
      (await setFileExternalLink(formsTemplateId, "", { access: "ReadWrite" }).catch(() => null)) ||
      fillLink;
  }

  const formsRoom = ensured?.formsRoom || (await requireFormsRoom().catch(() => null));
  const fallbackOpenUrl = config.baseUrl
    ? `${String(config.baseUrl).replace(/\/$/, "")}/doceditor?fileId=${encodeURIComponent(formsTemplateId)}&action=fill`
    : null;
  const openUrl = fillLink?.shareLink || fallbackOpenUrl || null;
  recordFillSignAssignment({
    assignmentId: randomUUID(),
    patientRoomId: String(roomId),
    patientId: userId ? String(userId) : null,
    patientName: fullName || null,
    templateFileId: formsTemplateId,
    templateTitle: templateInfo?.title || null,
    requestedBy: requestedByLabel || config.doctorEmail || "system",
    initiatedBy: "clinic",
    medicalRoomId: formsRoom?.id ? String(formsRoom.id) : null,
    shareLink: openUrl,
    shareToken: fillLink.requestToken || fillLink.shareToken || null
  });
  return true;
}

router.get("/session", async (req, res) => {
  const session = req.demoSession || null;
  if (!session) {
    return res.status(204).end();
  }
  return res.json({
    sessionId: session.id,
    patient: session.patient?.user ? userSafeProfile(session.patient.user) : null,
    patientToken: session.patient?.token ? String(session.patient.token) : null,
    doctor: session.doctor?.user ? userSafeProfile(session.doctor.user, { isDoctor: true }) : null,
    doctorToken: session.doctor?.token ? String(session.doctor.token) : null,
    room: session.patient?.room ? roomSafe(session.patient.room) : null
  });
});

router.post("/start", async (req, res) => {
  try {
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "");
    if (!checkStartRateLimit(ip)) {
      return res.status(429).json({ error: "Too many demo start attempts. Please try again in a minute." });
    }

    const existing = req.demoSession || null;
    if (existing?.id) {
      await cleanupDemoSession(existing).catch(() => null);
      deleteDemoSession(existing.id);
      clearDemoSessionCookie(res);
    }

    const session = createDemoSession({ patient: null, doctor: null });

    const patientFullName = buildSafeFullName(req.body?.patientName, "Demo", "Patient");
    const requestedDoctorName = String(req.body?.doctorName || "").trim();
    const doctorFullName = requestedDoctorName
      ? buildSafeFullName(requestedDoctorName, "Sarah", "Mitchell")
      : buildDemoDoctorName(session.id);

    const patientEmail = buildEmail({ sessionId: session.id, role: "patient" });
    const doctorEmail = buildEmail({ sessionId: session.id, role: "doctor" });
    const patientPassword = randomPassword();
    const doctorPassword = randomPassword();

    const patientUser = await createDocSpaceUser({
      fullName: patientFullName,
      email: patientEmail,
      password: patientPassword
    });
    const doctorUser = await createDocSpaceUser({
      fullName: doctorFullName,
      email: doctorEmail,
      password: doctorPassword
    });

    const [patientToken, doctorToken] = await Promise.all([
      authenticateUser({ userName: patientEmail, password: patientPassword }),
      authenticateUser({ userName: doctorEmail, password: doctorPassword })
    ]);

    const room = await createPatientRoom({ fullName: patientFullName, userId: patientUser?.id });
    await createPatientFolders({ roomId: room.id });
    recordPatientMapping({ userId: patientUser.id, roomId: room.id, patientName: patientFullName });

    const autoTemplateId = String(config.autoFillSignTemplateId || "").trim();
    if (autoTemplateId) {
      await ensureFillSignAssignmentFromTemplate({
        userId: patientUser?.id,
        fullName: patientFullName,
        roomId: room?.id,
        templateId: autoTemplateId,
        requestedByLabel: config.doctorEmail || "system"
      }).catch((e) => console.warn("[demo/start] auto fill-sign assignment failed", e?.message || e));
    }

    await ensureContractTemplateInRoom({ roomId: room?.id, fullName: patientFullName }).catch((e) =>
      console.warn("[demo/start] contract template ensure failed", e?.message || e)
    );

    const contractTemplateId = String(config.templateContractId || "").trim();
    if (contractTemplateId && contractTemplateId !== autoTemplateId) {
      await ensureFillSignAssignmentFromTemplate({
        userId: patientUser?.id,
        fullName: patientFullName,
        roomId: room?.id,
        templateId: contractTemplateId,
        requestedByLabel: config.doctorEmail || "system"
      }).catch((e) => console.warn("[demo/start] contract fill-sign assignment failed", e?.message || e));
    }

    const invitations = [
      { id: String(patientUser.id), access: config.patientAccess || "Editing" },
      { id: String(doctorUser.id), access: config.doctorAccess || "RoomManager" }
    ];
    await shareRoom({ roomId: room.id, invitations, notify: false }).catch(() => null);

    const verifiedRoom = await getRoomInfo(room.id).catch(() => null);
    const finalRoom = verifiedRoom?.id ? verifiedRoom : room;

    session.patient = {
      userId: String(patientUser.id),
      token: patientToken,
      user: patientUser,
      roomId: String(finalRoom.id),
      room: finalRoom
    };
    session.doctor = {
      userId: String(doctorUser.id),
      token: doctorToken,
      user: doctorUser
    };

    setDemoSessionCookie(res, session.id);

    return res.json({
      sessionId: session.id,
      patient: userSafeProfile(patientUser),
      patientToken: patientToken || null,
      doctor: userSafeProfile(doctorUser, { isDoctor: true }),
      doctorToken: doctorToken || null,
      room: roomSafe(finalRoom)
    });
  } catch (error) {
    console.error("[demo/start]", error?.message || error, error?.details || "");
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      error: status < 500 ? error.message : "Failed to start demo. Please try again."
    });
  }
});

router.post("/end", async (req, res) => {
  try {
    const session = req.demoSession || null;
    if (!session?.id) {
      clearDemoSessionCookie(res);
      return res.json({ ok: true });
    }
    const cleanup = await cleanupDemoSession(session);
    if (cleanup?.ok) {
      deleteDemoSession(session.id);
    }
    clearDemoSessionCookie(res);
    return res.json({ ok: true, cleanupPending: !cleanup?.ok });
  } catch (error) {
    console.error("[demo/end]", error?.message || error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
