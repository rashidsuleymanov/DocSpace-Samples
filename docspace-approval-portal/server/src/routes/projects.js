import { Router } from "express";
import { randomUUID } from "node:crypto";
import { createProject, deleteProject, getProject, listFlowsForUser, listProjects } from "../store.js";
import { createRoom, getRoomInfo, getRoomSecurityInfo, getSelfProfileWithToken, listRooms, shareRoom } from "../docspaceClient.js";
import { getConfig, updateConfig } from "../config.js";

const router = Router();

function normalizeEmailList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  return String(value)
    .split(/[,\n;]/g)
    .map((v) => String(v || "").trim())
    .filter(Boolean);
}

function requireUserToken(req) {
  const auth = String(req.headers.authorization || "").trim();
  if (!auth) {
    const err = new Error("Authorization token is required");
    err.status = 401;
    throw err;
  }
  return auth;
}

function isRoomAdminAccess(access) {
  if (typeof access === "number") return access >= 7;
  const v = String(access || "").trim().toLowerCase();
  if (/^\d+$/.test(v) && Number(v) >= 7) return true;
  return v === "roommanager" || v === "roomadmin";
}

function normalizeRoomAccess(access) {
  // For DocSpace room sharing (`PUT /files/rooms/{id}/share`), access values are expected as strings
  // like "FillForms", "ReadWrite", "RoomManager", etc. The share-info API may return numeric codes,
  // so we accept both and normalize to canonical strings.
  const byCode = {
    0: "Deny",
    1: "Read",
    2: "ReadWrite",
    3: "Review",
    4: "Comment",
    5: "FillForms",
    6: "ContentCreator",
    7: "RoomManager"
  };

  if (access === undefined || access === null) return "FillForms";
  if (typeof access === "number") return byCode[access] || "FillForms";

  const raw = String(access || "").trim();
  if (!raw) return "FillForms";

  const lower = raw.toLowerCase();
  if (/^\d+$/.test(lower)) return byCode[Number(lower)] || "FillForms";

  if (lower === "deny" || lower === "none") return "Deny";
  if (lower === "read") return "Read";
  if (lower === "readwrite") return "ReadWrite";
  if (lower === "review") return "Review";
  if (lower === "comment") return "Comment";
  if (lower === "fillforms") return "FillForms";
  if (lower === "contentcreator") return "ContentCreator";
  if (lower === "roommanager" || lower === "roomadmin") return "RoomManager";

  return "FillForms";
}

function roomMembersFromSecurityInfo(security) {
  if (!security) return [];
  if (Array.isArray(security)) return security;
  if (Array.isArray(security?.members)) return security.members;
  if (Array.isArray(security?.response)) return security.response;
  if (Array.isArray(security?.shared)) return security.shared;
  if (Array.isArray(security?.items)) return security.items;
  return [];
}

function canManageRoomFromSecurityInfo(security, userId) {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  const members = roomMembersFromSecurityInfo(security);
  const me =
    members.find((m) => String(m?.user?.id || m?.sharedTo?.id || "").trim() === uid) ||
    null;
  if (!me) return false;
  return Boolean(me?.isOwner) || isRoomAdminAccess(me?.access);
}

router.get("/", (_req, res) => {
  res.status(501).json({ error: "Use /sidebar with Authorization token" });
});

router.get("/permissions", async (req, res) => {
  try {
    const auth = requireUserToken(req);
    const user = await getSelfProfileWithToken(auth);
    const userId = String(user?.id || "").trim();
    if (!userId) return res.status(401).json({ error: "Invalid user token" });

    const projects = listProjects();
    const pairs = await Promise.all(
      projects.map(async (p) => {
        const pid = String(p?.id || "").trim();
        const roomId = String(p?.roomId || "").trim();
        if (!pid || !roomId) return [pid, false];
        const security = await getRoomSecurityInfo(roomId, auth).catch(() => null);
        const members = roomMembersFromSecurityInfo(security);
        const isMember = members.some((m) => String(m?.user?.id || m?.sharedTo?.id || "").trim() === userId);
        const canManage = isMember ? canManageRoomFromSecurityInfo(security, userId) : false;
        return [pid, canManage];
      })
    );

    res.json({ userId, permissions: Object.fromEntries(pairs.filter((x) => x?.[0])) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.details || null });
  }
});

router.get("/active", (_req, res) => {
  res.status(501).json({ error: "Use /sidebar with Authorization token" });
});

router.get("/sidebar", (req, res) => {
  (async () => {
    try {
      const auth = requireUserToken(req);
      const user = await getSelfProfileWithToken(auth);
      const userId = String(user?.id || "").trim();
      if (!userId) return res.status(401).json({ error: "Invalid user token" });

      const rooms = await listRooms(auth).catch(() => []);
      const accessibleRoomIds = new Set((rooms || []).map((r) => String(r?.id || "").trim()).filter(Boolean));
      if (!accessibleRoomIds.size) {
        const projects = listProjects();
        const checks = await Promise.all(
          projects.map(async (p) => {
            const roomId = String(p?.roomId || "").trim();
            if (!roomId) return null;
            const room = await getRoomInfo(roomId, auth).catch(() => null);
            return room?.id ? String(room.id) : null;
          })
        );
        for (const rid of checks) {
          if (rid) accessibleRoomIds.add(String(rid).trim());
        }
      }

      const cfg = getConfig();
      const configuredActiveRoomId = String(cfg.formsRoomId || "").trim();
      const activeRoomId = configuredActiveRoomId && accessibleRoomIds.has(configuredActiveRoomId) ? configuredActiveRoomId : "";

      const flows = listFlowsForUser(userId);
      const countsByRoomId = new Map();
      for (const flow of flows) {
        const roomId = String(flow?.projectRoomId || "").trim();
        if (!roomId) continue;
        if (!accessibleRoomIds.has(roomId)) continue;
        const entry = countsByRoomId.get(roomId) || { total: 0, inProgress: 0, completed: 0, other: 0 };
        entry.total += 1;
        if (flow.status === "InProgress") entry.inProgress += 1;
        else if (flow.status === "Completed") entry.completed += 1;
        else entry.other += 1;
        countsByRoomId.set(roomId, entry);
      }

      const projects = listProjects()
        .filter((p) => accessibleRoomIds.has(String(p?.roomId || "").trim()))
        .map((p) => {
          const roomId = String(p.roomId || "").trim();
          const counts = roomId ? countsByRoomId.get(roomId) : null;
          return {
            id: p.id,
            title: p.title,
            roomId: p.roomId,
            roomUrl: p.roomUrl || null,
            isCurrent: activeRoomId && String(p.roomId) === activeRoomId,
            counts: counts || { total: 0, inProgress: 0, completed: 0, other: 0 }
          };
        });

      res.json({
        activeRoomId: activeRoomId || null,
        projects
      });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message, details: error.details || null });
    }
  })();
});

router.get("/:projectId/members", async (req, res) => {
  try {
    const auth = requireUserToken(req);
    const project = getProject(req.params.projectId);
    if (!project?.roomId) return res.status(404).json({ error: "Project not found" });

    const me = await getSelfProfileWithToken(auth).catch(() => null);
    const meId = String(me?.id || "").trim();
    if (!meId) return res.status(401).json({ error: "Invalid user token" });

    const security = await getRoomSecurityInfo(project.roomId, auth).catch((e) => {
      const err = new Error(e?.message || "Failed to load room members");
      err.status = e?.status || 500;
      err.details = e?.details || null;
      throw err;
    });

    const members = roomMembersFromSecurityInfo(security);
    if (!members.length) return res.status(403).json({ error: "No access to this project room" });
    const isMember = members.some((m) => String(m?.user?.id || m?.sharedTo?.id || "").trim() === meId);
    if (!isMember) return res.status(403).json({ error: "No access to this project room" });

    const normalized = members.map((m) => ({
      subjectType: m?.subjectType ?? null,
      access: m?.access ?? null,
      isOwner: Boolean(m?.isOwner),
      canEditAccess: Boolean(m?.canEditAccess),
      canRevoke: Boolean(m?.canRevoke),
      user: (m?.user || m?.sharedTo || null)
        ? {
            id: (m?.user || m?.sharedTo).id ?? null,
            displayName: (m?.user || m?.sharedTo).displayName || (m?.user || m?.sharedTo).userName || "",
            email: (m?.user || m?.sharedTo).email || ""
          }
        : null,
      group: m?.group
        ? {
            id: m.group.id ?? null,
            name: m.group.name || ""
          }
        : null
    }));

    res.json({
      project: { id: project.id, title: project.title, roomId: project.roomId, roomUrl: project.roomUrl || null },
      members: normalized
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.details || null });
  }
});

router.delete("/:projectId/members/:userId", async (req, res) => {
  try {
    const auth = requireUserToken(req);
    const project = getProject(req.params.projectId);
    if (!project?.roomId) return res.status(404).json({ error: "Project not found" });

    const user = await getSelfProfileWithToken(auth);
    const userId = String(user?.id || "").trim();
    if (!userId) return res.status(401).json({ error: "Invalid user token" });

    const targetUserId = String(req.params.userId || "").trim();
    if (!targetUserId) return res.status(400).json({ error: "userId is required" });
    if (targetUserId === userId) return res.status(400).json({ error: "You cannot remove yourself" });

    const security =
      (await getRoomSecurityInfo(project.roomId, auth).catch(() => null)) ||
      (await getRoomSecurityInfo(project.roomId).catch((e) => {
        const err = new Error(e?.message || "Failed to load room members");
        err.status = e?.status || 500;
        err.details = e?.details || null;
        throw err;
      }));

    if (!canManageRoomFromSecurityInfo(security, userId)) {
      return res.status(403).json({ error: "Only the room admin can remove members" });
    }

    const members = roomMembersFromSecurityInfo(security);
    const target =
      members.find((m) => String(m?.user?.id || m?.sharedTo?.id || "").trim() === targetUserId) || null;
    if (!target) return res.status(404).json({ error: "Member not found" });
    if (target?.isOwner) return res.status(403).json({ error: "Owner cannot be removed" });

    // DocSpace API doesn't have a dedicated "remove member" endpoint; revoking is done via share API.
    // Setting access to "Deny" removes access to the room for that user.
    const invitations = [{ id: targetUserId, access: normalizeRoomAccess("Deny") }];
    let shareResult = await shareRoom({ roomId: project.roomId, invitations, notify: false }, auth).catch((e) => e);
    if (shareResult instanceof Error) {
      // Fallback to server admin token (if configured) for setups where room-managers can't manage sharing via API.
      shareResult = await shareRoom({ roomId: project.roomId, invitations, notify: false }).catch((e) => {
        const err = new Error(e?.message || "Failed to remove member");
        err.status = e?.status || 500;
        err.details = e?.details || null;
        throw err;
      });
    }

    res.json({ ok: true, shareResult });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.details || null });
  }
});

router.delete("/:projectId", async (req, res) => {
  try {
    const project = getProject(req.params.projectId);
    if (!project?.id) return res.status(404).json({ error: "Project not found" });

    const auth = requireUserToken(req);
    const user = await getSelfProfileWithToken(auth);
    const userId = String(user?.id || "").trim();
    if (!userId) return res.status(401).json({ error: "Invalid user token" });
    const security =
      (await getRoomSecurityInfo(project.roomId, auth).catch(() => null)) ||
      (await getRoomSecurityInfo(project.roomId).catch(() => null));
    if (!canManageRoomFromSecurityInfo(security, userId)) {
      return res.status(403).json({ error: "Only the room admin can remove projects" });
    }

    const ok = deleteProject(project.id);
    const cfg = getConfig();
    if (ok && String(cfg.formsRoomId || "").trim() && String(cfg.formsRoomId) === String(project.roomId)) {
      await updateConfig({ formsRoomId: "", formsRoomTitle: "" }).catch(() => null);
    }

    res.json({ ok: Boolean(ok) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.details || null });
  }
});

router.post("/", async (req, res) => {
  try {
    const auth = requireUserToken(req);
    const user = await getSelfProfileWithToken(auth);
    const userId = String(user?.id || "").trim();
    if (!userId) return res.status(401).json({ error: "Invalid user token" });

    const { title } = req.body || {};
    const name = String(title || "").trim();
    if (!name) return res.status(400).json({ error: "title is required" });

    const created = await createRoom({ title: name, roomType: 1 });
    const roomId = created?.id ?? created?.response?.id ?? created?.folder?.id ?? null;
    if (!roomId) return res.status(500).json({ error: "Failed to determine created room id" });

    // Ensure the creator has access to the room, otherwise they won't see the project.
    const creatorInvite = { id: userId, access: normalizeRoomAccess("RoomManager") };
    const creatorEmail = String(user?.email || "").trim();
    const creatorEmailInvite = creatorEmail ? { email: creatorEmail, access: normalizeRoomAccess("RoomManager") } : null;
    let shareResult = await shareRoom({
      roomId: String(roomId),
      invitations: [creatorInvite],
      notify: false
    }).catch((e) => e);
    if (shareResult instanceof Error) {
      shareResult = creatorEmailInvite
        ? await shareRoom({ roomId: String(roomId), invitations: [creatorEmailInvite], notify: false }).catch((e) => e)
        : shareResult;
    }
    if (shareResult instanceof Error) {
      return res.status(500).json({
        error: "Project room created, but failed to grant access to its creator",
        details: shareResult?.details || null,
        roomId: String(roomId)
      });
    }

    const project = createProject({
      id: randomUUID(),
      title: name,
      roomId: String(roomId),
      roomUrl: created?.webUrl || created?.shortWebUrl || null
    });

    await updateConfig({ formsRoomId: String(roomId), formsRoomTitle: name }).catch(() => null);

    res.json({ project, activeRoomId: String(roomId) });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/:projectId/activate", async (req, res) => {
  try {
    const project = getProject(req.params.projectId);
    if (!project?.roomId) return res.status(404).json({ error: "Project not found" });
    await updateConfig({ formsRoomId: String(project.roomId), formsRoomTitle: project.title }).catch(() => null);
    res.json({ ok: true, activeRoomId: String(project.roomId) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.details || null });
  }
});

router.post("/:projectId/invite", async (req, res) => {
  try {
    const project = getProject(req.params.projectId);
    if (!project?.roomId) return res.status(404).json({ error: "Project not found" });

    const auth = requireUserToken(req);
    const user = await getSelfProfileWithToken(auth);
    const userId = String(user?.id || "").trim();
    if (!userId) return res.status(401).json({ error: "Invalid user token" });
    const security =
      (await getRoomSecurityInfo(project.roomId, auth).catch(() => null)) ||
      (await getRoomSecurityInfo(project.roomId).catch(() => null));
    if (!canManageRoomFromSecurityInfo(security, userId)) {
      return res.status(403).json({ error: "Only the room admin can invite users" });
    }

    const { emails, access = "FillForms", notify = false, message } = req.body || {};
    const list = normalizeEmailList(emails);
    if (!list.length) return res.status(400).json({ error: "emails is required" });

    const normalizedAccess = normalizeRoomAccess(access);
    const invitations = list.map((email) => ({ email, access: normalizedAccess }));
    const shareResult = await shareRoom(
      {
      roomId: project.roomId,
      invitations,
      notify: Boolean(notify),
      message
      },
      auth
    );

    res.json({ invited: invitations.length, shareResult });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

export default router;
