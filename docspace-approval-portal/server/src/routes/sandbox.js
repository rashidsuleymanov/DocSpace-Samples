import { Router } from "express";
import {
  createRoom,
  ensureFormsRoomFolders,
  findRoomByCandidates,
  getRoomInfo,
  getFormsRoomFolders,
  getAdminProfile,
  getUserByEmail,
  listRooms,
  requireFormsRoom,
  shareRoom
} from "../docspaceClient.js";
import { getConfig, updateConfig, validateConfig } from "../config.js";

const router = Router();

function normalizeEmailList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  return String(value)
    .split(/[,\n;]/g)
    .map((v) => String(v || "").trim())
    .filter(Boolean);
}

function maskSecret(value) {
  const raw = String(value || "");
  if (!raw) return "";
  const last = raw.slice(-6);
  return `${"*".repeat(Math.max(0, raw.length - last.length))}${last}`;
}

function normalizeRoomType(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  return String(value).trim();
}

function parseRoomTypeFilter(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && String(asNum) === raw) return String(asNum);
  return raw.toLowerCase();
}

function matchesRoomType(room, filter) {
  if (!filter) return true;
  const aliases = {
    "1": ["fillingformsroom"],
    fillingformsroom: ["1"]
  };
  const candidates = [room?.rootRoomType, room?.roomType, room?.folderType]
    .map(normalizeRoomType)
    .filter(Boolean)
    .map((v) => (v.match(/^\d+$/) ? v : v.toLowerCase()));
  if (candidates.includes(filter)) return true;
  const expanded = aliases[filter] || [];
  return expanded.some((a) => candidates.includes(a));
}

router.get("/config", (_req, res) => {
  const cfg = getConfig();
  res.json({
    baseUrl: cfg.baseUrl || "",
    hasAuthToken: Boolean(cfg.rawAuthToken),
    authTokenMasked: cfg.rawAuthToken ? maskSecret(cfg.rawAuthToken) : "",
    formsRoomId: cfg.formsRoomId || "",
    libraryRoomId: cfg.libraryRoomId || "",
    formsRoomTitle: cfg.formsRoomTitle || "",
    formsRoomTitleFallbacks: Array.isArray(cfg.formsRoomTitleFallbacks) ? cfg.formsRoomTitleFallbacks : [],
    formsTemplatesFolderTitle: cfg.formsTemplatesFolderTitle || ""
  });
});

router.put("/config", async (req, res) => {
  try {
    const patch = req.body || {};
    if (patch.formsRoomId !== undefined && patch.formsRoomTitle === undefined) {
      const room = await getRoomInfo(patch.formsRoomId).catch(() => null);
      if (room?.title) patch.formsRoomTitle = String(room.title);
    }
    const next = await updateConfig(patch);
    const errors = validateConfig({ requiresAuth: false }, next);
    res.json({
      baseUrl: next.baseUrl || "",
      hasAuthToken: Boolean(next.rawAuthToken),
      authTokenMasked: next.rawAuthToken ? maskSecret(next.rawAuthToken) : "",
      formsRoomId: next.formsRoomId || "",
      libraryRoomId: next.libraryRoomId || "",
      formsRoomTitle: next.formsRoomTitle || "",
      formsRoomTitleFallbacks: Array.isArray(next.formsRoomTitleFallbacks) ? next.formsRoomTitleFallbacks : [],
      formsTemplatesFolderTitle: next.formsTemplatesFolderTitle || "",
      warnings: errors
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/config/test", async (_req, res) => {
  try {
    const errors = validateConfig({ requiresAuth: true });
    if (errors.length) {
      return res.status(400).json({ error: "Config is incomplete", details: errors.join("; "), errors });
    }

    const [profile, rooms] = await Promise.all([getAdminProfile(), listRooms().catch(() => [])]);
    res.json({
      ok: true,
      profile: profile?.id ? { id: profile.id, email: profile.email || null, displayName: profile.displayName || null } : null,
      roomsCount: Array.isArray(rooms) ? rooms.length : 0
    });
  } catch (error) {
    res.status(error.status || 500).json({
      ok: false,
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/rooms", async (req, res) => {
  try {
    const filter = parseRoomTypeFilter(req.query.roomType || req.query.type);
    const rooms = await listRooms().catch(() => []);
    const filtered = (rooms || []).filter((r) => matchesRoomType(r, filter));
    res.json({
      rooms: filtered.map((r) => ({
        id: r?.id ?? null,
        title: r?.title || r?.name || "",
        rootRoomType: r?.rootRoomType ?? null,
        roomType: r?.roomType ?? null,
        webUrl: r?.webUrl || null
      }))
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/rooms", async (req, res) => {
  try {
    const { title, roomType = 1, select = true } = req.body || {};
    const safeTitle = String(title || "").trim();
    if (!safeTitle) return res.status(400).json({ error: "title is required" });

    const created = await createRoom({ title: safeTitle, roomType }).catch((e) => {
      const err = new Error(e?.message || "Failed to create room");
      err.status = e?.status || 500;
      err.details = e?.details || null;
      throw err;
    });

    const roomId = created?.id ?? created?.response?.id ?? created?.folder?.id ?? null;
    if (select && roomId) {
      await updateConfig({ formsRoomId: String(roomId), formsRoomTitle: safeTitle });
    }

    res.json({
      room: {
        id: roomId,
        title: created?.title || safeTitle,
        rootRoomType: created?.rootRoomType ?? null,
        roomType: created?.roomType ?? null,
        webUrl: created?.webUrl || null
      }
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/status", async (req, res) => {
  try {
    const cfg = getConfig();
    const roomId = String(req.query.roomId || "").trim() || String(cfg.formsRoomId || "").trim();
    const roomTitle = String(req.query.roomTitle || "").trim();

    let room = null;
    if (roomId) {
      room = await getRoomInfo(roomId).catch(() => null);
    } else if (roomTitle) {
      room = await findRoomByCandidates([roomTitle]).catch(() => null);
    } else {
      room = await requireFormsRoom().catch(() => null);
    }
    if (!room?.id) {
      return res.json({ room: null, folders: null });
    }

    const folders = await getFormsRoomFolders(room.id);

    res.json({
      room: { id: room.id, title: room.title, webUrl: room.webUrl || null },
      folders: folders
        ? {
            inProcess: folders.inProcess?.id ? { id: folders.inProcess.id, title: folders.inProcess.title } : null,
            complete: folders.complete?.id ? { id: folders.complete.id, title: folders.complete.title } : null,
            templates: folders.templates?.id ? { id: folders.templates.id, title: folders.templates.title } : null
          }
        : null
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/bootstrap", async (req, res) => {
  try {
    const {
      roomId,
      workspaceName,
      roomTitle,
      roomType = 1,
      createFolders = true,
      memberEmails,
      memberAccess = "FillForms",
      notify = false,
      message
    } = req.body || {};

    const cfg = getConfig();
    const requestedRoomId = String(roomId || "").trim() || String(cfg.formsRoomId || "").trim();

    let room = null;
    if (requestedRoomId) {
      room = await getRoomInfo(requestedRoomId).catch(() => null);
      if (!room?.id) {
        return res.status(404).json({ error: "Room not found", details: requestedRoomId });
      }
    } else {
      const safeWorkspace = String(workspaceName || "").trim();
      const safeTitle = String(roomTitle || "").trim() || (safeWorkspace ? `${safeWorkspace} - Forms` : "");
      if (!safeTitle) {
        return res.status(400).json({ error: "roomId (recommended) or roomTitle (or workspaceName) is required" });
      }

      room = await findRoomByCandidates([safeTitle]).catch(() => null);
      if (!room?.id) {
        const created = await createRoom({ title: safeTitle, roomType }).catch((e) => {
          const err = new Error(e?.message || "Failed to create room");
          err.status = e?.status || 500;
          err.details = e?.details || null;
          throw err;
        });
        room = { id: created?.id || created?.response?.id || created?.folder?.id, title: created?.title || safeTitle };
      }

      if (room?.id) {
        await updateConfig({ formsRoomId: String(room.id), formsRoomTitle: String(room.title || safeTitle) }).catch(() => null);
      }
    }

    let folders = null;
    if (createFolders) {
      folders = await ensureFormsRoomFolders(room.id).catch(() => null);
    }

    const emails = normalizeEmailList(memberEmails);
    const invitations = [];
    for (const email of emails) {
      const user = await getUserByEmail(email).catch(() => null);
      if (user?.id) {
        invitations.push({ id: user.id, access: memberAccess });
      } else {
        invitations.push({ email, access: memberAccess });
      }
    }

    const shareResult = invitations.length
      ? await shareRoom({ roomId: room.id, invitations, notify: Boolean(notify), message }).catch(() => null)
      : null;

    res.json({
      room,
      folders: folders
        ? {
            inProcess: folders.inProcess?.id ? { id: folders.inProcess.id, title: folders.inProcess.title } : null,
            complete: folders.complete?.id ? { id: folders.complete.id, title: folders.complete.title } : null,
            templates: folders.templates?.id ? { id: folders.templates.id, title: folders.templates.title } : null
          }
        : null,
      invited: invitations.length,
      shareResult
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

export default router;
