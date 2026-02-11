import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  ensureExternalLinkAccess,
  getFillOutLink,
  getFileInfo,
  getRoomInfo,
  getRoomSecurityInfo,
  getSelfProfileWithToken,
  getUserByEmail,
  requireFormsRoom,
  setFileExternalLink,
  getFormsRoomFolders,
  getFolderContents,
  ensureFolderByTitleWithin,
  createRoom,
  shareRoom,
  startFilling,
  createFileFromTemplateToFolder
} from "../docspaceClient.js";
import { getConfig, updateConfig } from "../config.js";
import { cancelFlow, createFlow, getFlow, listFlowsForRoom, listFlowsForUser, updateFlow, updateProject } from "../store.js";
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

function normalize(value) {
  return String(value || "").trim();
}

function normalizeKind(value) {
  const v = normalize(value).toLowerCase();
  if (v === "fillsign" || v === "fill-sign" || v === "fill_sign" || v === "sign") return "fillSign";
  if (v === "sharedsign" || v === "shared-sign" || v === "shared_sign" || v === "contract") return "sharedSign";
  return "approval";
}

function isFlowCompleted(info) {
  const status = String(info?.formFillingStatus ?? "").trim().toLowerCase();
  const comment = String(info?.comment ?? "").trim().toLowerCase();
  if (status === "complete" || status === "completed") return true;
  if (comment === "submitted form") return true;
  return false;
}

function stripExtension(title) {
  const value = normalize(title);
  if (!value) return "";
  return value.replace(/\.[a-z0-9]+$/i, "");
}

function includesNeedle(hay, needle) {
  const h = normalize(hay).toLowerCase();
  const n = normalize(needle).toLowerCase();
  if (!h || !n) return false;
  return h.includes(n);
}

function normalizeName(value) {
  return normalize(value).replace(/\s+/g, " ");
}

function candidateUserIdFromInfo(info) {
  if (!info || typeof info !== "object") return "";
  const candidates = [
    info?.createdBy?.id,
    info?.createdById,
    info?.updatedBy?.id,
    info?.updatedById,
    info?.modifiedBy?.id,
    info?.modifiedById
  ]
    .map((v) => normalize(v))
    .filter(Boolean);
  return candidates[0] || "";
}

async function cachedFolderContents(folderId, auth, cache) {
  const fid = normalize(folderId);
  if (!fid) return null;
  if (cache.has(fid)) return cache.get(fid);
  const contents =
    (await getFolderContents(fid, auth).catch(() => null)) ||
    (await getFolderContents(fid).catch(() => null)) ||
    null;
  cache.set(fid, contents);
  return contents;
}

async function resolveTemplateFolderIds({ parentFolderId, templateTitle, auth, contentsCache, folderIdCache }) {
  const parentId = normalize(parentFolderId);
  const base = stripExtension(templateTitle) || normalize(templateTitle);
  const key = `${parentId}:${base}`;
  if (folderIdCache.has(key)) return folderIdCache.get(key);

  // Always include parent folder as fallback (instances might be directly inside it).
  const ids = new Set([parentId].filter(Boolean));

  const contents = await cachedFolderContents(parentId, auth, contentsCache);
  const folders = (contents?.items || []).filter((i) => i.type === "folder");
  for (const folder of folders) {
    const title = normalize(folder?.title || "");
    if (!title) continue;
    if (title === base || title.includes(base)) {
      const id = normalize(folder?.id);
      if (id) ids.add(id);
    }
  }

  const result = Array.from(ids);
  folderIdCache.set(key, result);
  return result;
}

async function findLatestInstanceMatch({
  folderIds,
  templateTitle,
  recipientEmail,
  recipientName,
  recipientUserId,
  createdAfterIso,
  auth,
  contentsCache,
  fileInfoCache
}) {
  const email = normalize(recipientEmail).toLowerCase();
  const local = email.includes("@") ? email.split("@")[0] : email;
  const name = normalizeName(recipientName);
  const userId = normalize(recipientUserId);
  const base = stripExtension(templateTitle) || normalize(templateTitle);
  const hasRecipientNeedle = Boolean(email || local || name);

  const candidates = [];
  for (const folderId of folderIds || []) {
    const contents = await cachedFolderContents(folderId, auth, contentsCache);
    const files = (contents?.items || []).filter((i) => i.type === "file");
    for (const file of files) {
      const title = String(file?.title || "");
      if (!includesNeedle(title, base)) continue;
      if (hasRecipientNeedle) {
        const matchesRecipient =
          (email && includesNeedle(title, email)) ||
          (local && includesNeedle(title, local)) ||
          (name && includesNeedle(title, name));
        if (!matchesRecipient) continue;
      }
      const createdAt = String(file?.created || file?.createdAt || "");
      if (createdAfterIso && createdAt && String(createdAt).localeCompare(String(createdAfterIso)) < 0) continue;
      candidates.push({ id: normalize(file?.id), title, createdAt, webUrl: file?.webUrl || null });
    }
  }

  candidates.sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
  for (const picked of candidates.slice(0, 8)) {
    if (!picked?.id) continue;
    let info = fileInfoCache.get(picked.id) || null;
    if (!info) {
      info = await getFileInfo(picked.id, auth).catch(() => null);
      fileInfoCache.set(picked.id, info);
    }
    if (userId) {
      const fromInfo = candidateUserIdFromInfo(info);
      if (fromInfo && fromInfo !== userId) continue;
    }
    return { ...picked, info };
  }

  return null;
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

function isRoomAdminAccess(access) {
  if (typeof access === "number") return access >= 7;
  const v = String(access || "").trim().toLowerCase();
  if (/^\d+$/.test(v) && Number(v) >= 7) return true;
  return v === "roommanager" || v === "roomadmin";
}

function canManageRoomFromSecurityInfo(security, userId) {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  const members = roomMembersFromSecurityInfo(security);
  const me = members.find((m) => String(m?.user?.id || m?.sharedTo?.id || "").trim() === uid) || null;
  if (!me) return false;
  return Boolean(me?.isOwner) || isRoomAdminAccess(me?.access);
}

async function resolveFlows(rawFlows, auth) {
  const formsFoldersCache = new Map(); // roomId -> folders
  const contentsCache = new Map(); // folderId -> contents
  const templateFolderIdsCache = new Map(); // `${parentId}:${base}` -> ids
  const fileInfoCache = new Map(); // fileId -> info

  const flows = await Promise.all(
    (rawFlows || []).map(async (flow) => {
      const status = String(flow?.status || "");
      if (status === "Canceled") return flow;

      if (normalizeKind(flow?.kind) === "sharedSign") {
        // For shared-signing, completion is tracked per recipient in the portal (manual "Complete").
        return flow;
      }

      const isAlreadyCompleted = status === "Completed";
      if (isAlreadyCompleted && (flow?.resultFileUrl || flow?.resultFileId)) return flow;

      const projectRoomId = normalize(flow?.projectRoomId);
      const recipient =
        Array.isArray(flow?.recipientEmails) && flow.recipientEmails.length === 1 ? String(flow.recipientEmails[0] || "") : "";
      const templateTitle = String(flow?.templateTitle || flow?.fileTitle || "");
      if (!projectRoomId || !templateTitle) return flow;

      let folders = formsFoldersCache.get(projectRoomId) || null;
      if (!folders) {
        folders =
          (await getFormsRoomFolders(projectRoomId, auth).catch(() => null)) ||
          (await getFormsRoomFolders(projectRoomId).catch(() => null)) ||
          null;
        formsFoldersCache.set(projectRoomId, folders);
      }

      const inProcessRoot = normalize(folders?.inProcess?.id);
      const completeRoot = normalize(folders?.complete?.id);
      if (!inProcessRoot && !completeRoot) return flow;

      const createdAfterIso = String(flow?.createdAt || "");

      const inProcessFolderIds = inProcessRoot
        ? await resolveTemplateFolderIds({
            parentFolderId: inProcessRoot,
            templateTitle,
            auth,
            contentsCache,
            folderIdCache: templateFolderIdsCache
          })
        : [];
      const completeFolderIds = completeRoot
        ? await resolveTemplateFolderIds({
            parentFolderId: completeRoot,
            templateTitle,
            auth,
            contentsCache,
            folderIdCache: templateFolderIdsCache
          })
        : [];

      const completedMatch = await findLatestInstanceMatch({
        folderIds: completeFolderIds,
        templateTitle,
        recipientEmail: recipient,
        recipientName: String(flow?.recipientName || ""),
        recipientUserId: normalize(flow?.recipientUserId),
        createdAfterIso,
        auth,
        contentsCache,
        fileInfoCache
      });
      if (completedMatch?.id) {
        return {
          ...flow,
          status: "Completed",
          resultFileId: completedMatch.id,
          resultFileTitle: completedMatch.title || null,
          resultFileUrl: completedMatch.webUrl || null
        };
      }

      const inProcessMatch = await findLatestInstanceMatch({
        folderIds: inProcessFolderIds,
        templateTitle,
        recipientEmail: recipient,
        recipientName: String(flow?.recipientName || ""),
        recipientUserId: normalize(flow?.recipientUserId),
        createdAfterIso,
        auth,
        contentsCache,
        fileInfoCache
      });
      if (inProcessMatch?.info && isFlowCompleted(inProcessMatch.info)) {
        return {
          ...flow,
          status: "Completed",
          resultFileId: inProcessMatch.id,
          resultFileTitle: inProcessMatch.title || null,
          resultFileUrl: inProcessMatch.webUrl || null
        };
      }

      if (isAlreadyCompleted) return flow;

      return { ...flow, status: "InProgress" };
    })
  );

  return flows;
}

router.get("/", async (req, res) => {
  try {
    const auth = requireUserToken(req);
    const user = await getSelfProfileWithToken(auth);
    const userId = String(user?.id || "").trim();
    if (!userId) return res.status(401).json({ error: "Invalid user token" });
    const userEmail = String(user?.email || "").trim().toLowerCase();

    const rawFlows = listFlowsForUser({ userId, userEmail });
    const flows = await resolveFlows(rawFlows, auth);

    res.json({ flows });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/project/:projectId", async (req, res) => {
  try {
    const auth = requireUserToken(req);

    const projectId = normalize(req.params?.projectId);
    if (!projectId) return res.status(400).json({ error: "projectId is required" });

    const project = getProject(projectId);
    if (!project?.roomId) return res.status(404).json({ error: "Project not found" });

    const user = await getSelfProfileWithToken(auth);
    const userId = normalize(user?.id);
    if (!userId) return res.status(401).json({ error: "Invalid user token" });
    const userEmail = String(user?.email || "").trim().toLowerCase();

    const roomId = normalize(project.roomId);
    const security = await getRoomSecurityInfo(roomId, auth).catch(() => null);
    const members = roomMembersFromSecurityInfo(security);
    const isMember = members.some((m) => normalize(m?.user?.id || m?.sharedTo?.id) === userId);
    if (!isMember) return res.status(403).json({ error: "No access to this project" });

    const canManage = canManageRoomFromSecurityInfo(security, userId);
    const rawFlows = canManage
      ? listFlowsForRoom(roomId)
      : listFlowsForUser({ userId, userEmail }).filter((f) => normalize(f?.projectRoomId) === roomId);

    const flows = await resolveFlows(rawFlows, auth);
    res.json({ flows, canManage });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/:flowId/cancel", async (req, res) => {
  try {
    const auth = requireUserToken(req);
    const flowId = normalize(req.params?.flowId);
    if (!flowId) return res.status(400).json({ error: "flowId is required" });

    const flow = getFlow(flowId);
    if (!flow?.id) return res.status(404).json({ error: "Request not found" });
    if (String(flow.status || "") === "Completed") {
      return res.status(400).json({ error: "Completed requests cannot be canceled" });
    }
    if (String(flow.status || "") === "Canceled") {
      return res.json({ ok: true, flow });
    }

    const me = await getSelfProfileWithToken(auth).catch(() => null);
    const meId = normalize(me?.id);
    if (!meId) return res.status(401).json({ error: "Invalid user token" });

    const roomId = normalize(flow?.projectRoomId);
    if (!roomId) return res.status(400).json({ error: "Request has no project room" });

    const security = await getRoomSecurityInfo(roomId, auth).catch(() => null);
    if (!canManageRoomFromSecurityInfo(security, meId)) {
      return res.status(403).json({ error: "Only the project admin can cancel requests" });
    }

    const displayName =
      me?.displayName ||
      [me?.firstName, me?.lastName].filter(Boolean).join(" ") ||
      me?.userName ||
      me?.email ||
      "User";

    const updated = cancelFlow(flowId, { canceledByUserId: meId, canceledByName: displayName });
    if (!updated) return res.status(500).json({ error: "Failed to cancel request" });
    return res.json({ ok: true, flow: updated });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/:flowId/complete", async (req, res) => {
  try {
    const auth = requireUserToken(req);
    const flowId = normalize(req.params?.flowId);
    if (!flowId) return res.status(400).json({ error: "flowId is required" });

    const flow = getFlow(flowId);
    if (!flow?.id) return res.status(404).json({ error: "Request not found" });
    if (normalizeKind(flow?.kind) !== "sharedSign") {
      return res.status(400).json({ error: "Only shared signing requests can be completed manually" });
    }
    if (String(flow.status || "") === "Canceled") {
      return res.status(400).json({ error: "Canceled requests cannot be completed" });
    }
    if (String(flow.status || "") === "Completed") {
      return res.json({ ok: true, flow });
    }

    const me = await getSelfProfileWithToken(auth).catch(() => null);
    const meId = normalize(me?.id);
    if (!meId) return res.status(401).json({ error: "Invalid user token" });
    const meEmail = String(me?.email || "").trim().toLowerCase();

    const recipients = Array.isArray(flow?.recipientEmails) ? flow.recipientEmails : [];
    const isRecipient = meEmail && recipients.map((e) => String(e || "").trim().toLowerCase()).includes(meEmail);

    const roomId = normalize(flow?.projectRoomId);
    let canManage = false;
    if (roomId) {
      const security = await getRoomSecurityInfo(roomId, auth).catch(() => null);
      canManage = canManageRoomFromSecurityInfo(security, meId);
    }

    if (!isRecipient && !canManage) {
      return res.status(403).json({ error: "Only recipients or project admins can complete this request" });
    }

    const displayName =
      me?.displayName ||
      [me?.firstName, me?.lastName].filter(Boolean).join(" ") ||
      me?.userName ||
      me?.email ||
      "User";

    const updated = updateFlow(flowId, {
      status: "Completed",
      completedAt: new Date().toISOString(),
      completedByUserId: meId || null,
      completedByName: displayName || null
    });

    if (!updated) return res.status(500).json({ error: "Failed to complete request" });
    return res.json({ ok: true, flow: updated });
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
    const recipientEmails = Array.isArray(req.body?.recipientEmails)
      ? req.body.recipientEmails.map((e) => String(e || "").trim()).filter(Boolean)
      : [];

    const kind = normalizeKind(req.body?.kind);

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

    let fillLink = null;
    if (kind !== "fillSign" && kind !== "sharedSign") {
      const desiredTitle = "Link to fill out";
      fillLink = await getFillOutLink(templateFileId).catch(() => null);
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
    }

    if (kind === "sharedSign") {
      if (!recipientEmails.length) {
        return res.status(400).json({
          error: "Recipients are required",
          details: "Select at least one person to sign this document."
        });
      }

      const project = targetProjectId ? getProject(targetProjectId) : null;
      if (!project?.id) {
        return res.status(400).json({
          error: "Project is required",
          details: "Pick a project for shared signing."
        });
      }

      // Ensure we have a non-forms room (roomType=2) to keep a single shared document instance,
      // modeled after medical portal patient rooms.
      let signingRoomId = normalize(project?.signingRoomId);
      if (!signingRoomId) {
        const roomTitle = `${String(project.title || "Project").trim()} — Signing`;
        const created = await createRoom({ title: roomTitle, roomType: 2 }).catch((e) => {
          const err = new Error(e?.message || "Failed to create signing room");
          err.status = e?.status || 500;
          err.details = e?.details || null;
          throw err;
        });
        signingRoomId = normalize(created?.id ?? created?.response?.id ?? created?.folder?.id ?? null);
        if (!signingRoomId) return res.status(500).json({ error: "Failed to determine signing room id" });
        updateProject(project.id, { signingRoomId });
      }

      // Ensure the creator can access the signing room (it may be created by the server admin token).
      const invitations = [{ id: String(user?.id || ""), access: "RoomManager" }].filter((i) => i.id);
      if (invitations.length) {
        let shareResult = await shareRoom({ roomId: signingRoomId, invitations, notify: false }, auth).catch((e) => e);
        if (shareResult instanceof Error) {
          await shareRoom({ roomId: signingRoomId, invitations, notify: false }).catch(() => null);
        }
      }

      const signingRoomInfo = await getRoomInfo(signingRoomId, auth).catch(() => null);

      const folder = await ensureFolderByTitleWithin(signingRoomId, "Contracts", auth).catch(() => null);
      const destFolderId = normalize(folder?.id) || signingRoomId;
      const safeDate = new Date().toISOString().slice(0, 10);
      const baseTitle = String(templateInfo?.title || "Document").trim();
      const destTitle = `${baseTitle.replace(/\.[a-z0-9]+$/i, "")} — ${safeDate}${baseTitle.match(/\.[a-z0-9]+$/i)?.[0] || ""}`;

      const createdFile = await createFileFromTemplateToFolder(
        { templateFileId, destFolderId, title: destTitle },
        auth
      ).catch((e) => {
        const err = new Error(e?.message || "Failed to create shared document from template");
        err.status = e?.status || 500;
        err.details = e?.details || null;
        throw err;
      });

      const createdFileId = normalize(createdFile?.id);
      if (createdFileId) {
        await startFilling(createdFileId, auth).catch(() => null);
      }

      const fillUrl = createdFileId
        ? `${String(cfg.baseUrl || "").replace(/\/$/, "")}/doceditor?fileId=${encodeURIComponent(createdFileId)}&action=fill`
        : null;

      const linkTitle = "Link to sign";
      let signLink = await getFillOutLink(createdFileId, auth).catch(() => null);
      if (!signLink?.shareLink) {
        signLink =
          (await ensureExternalLinkAccess(createdFileId, { access: "FillForms", title: linkTitle }, auth).catch(() => null)) ||
          (await setFileExternalLink(createdFileId, auth, { access: "FillForms" }).catch(() => null)) ||
          signLink;
      }

      const hasPublicLink = Boolean(signLink?.shareLink);
      // Prefer the explicit Fill mode URL (same as medical portal doctor flow).
      const openUrl = fillUrl || signLink?.shareLink || null;
      let warning = "";
      if (!hasPublicLink) {
        warning =
          "Public signing link is unavailable for this document. The portal will use an authenticated DocSpace link instead (recipients must have DocSpace access).";

        // Best-effort: grant recipients access to the signing room so they can open it in DocSpace.
        const invitations = recipientEmails.map((email) => ({ email, access: "ReadWrite" }));
        if (invitations.length) {
          let shareResult = await shareRoom({ roomId: signingRoomId, invitations, notify: false }, auth).catch((e) => e);
          if (shareResult instanceof Error) {
            await shareRoom({ roomId: signingRoomId, invitations, notify: false }).catch(() => null);
          }
        }
      }

      // Create one assignment per recipient, but all point to the same shared file.
      const groupId = randomUUID();
      const created = [];
      for (const emailRaw of recipientEmails) {
        const email = normalize(emailRaw).toLowerCase();
        if (!email) continue;

        const userByEmail = await getUserByEmail(email, auth).catch(() => null);
        const recipientUserId = normalize(userByEmail?.id);
        const recipientName =
          userByEmail?.displayName ||
          [userByEmail?.firstName, userByEmail?.lastName].filter(Boolean).join(" ") ||
          userByEmail?.userName ||
          userByEmail?.email ||
          email;

        const flow = createFlow({
          id: randomUUID(),
          groupId,
          kind: "sharedSign",
          templateFileId,
          templateTitle: templateInfo.title || null,
          fileId: createdFileId,
          fileTitle: createdFile?.title || templateInfo.title || null,
          projectRoomId: targetRoomId || null,
          documentRoomId: signingRoomId,
          documentRoomTitle: signingRoomInfo?.title || null,
          documentRoomUrl: signingRoomInfo?.webUrl || signingRoomInfo?.shortWebUrl || null,
          createdByUserId: user?.id,
          recipientEmails: [email],
          recipientUserId: recipientUserId || null,
          recipientName: recipientName || null,
          createdByName: displayName || null,
          openUrl,
          linkRequestToken: signLink.requestToken || null,
          status: "InProgress"
        });
        if (flow) created.push(flow);
      }

      return res.json({
        groupId,
        flow: created[0] || null,
        flows: created,
        warning: warning || null,
        signingRoom: signingRoomInfo?.id
          ? { id: String(signingRoomInfo.id), title: signingRoomInfo.title || "", webUrl: signingRoomInfo.webUrl || null }
          : { id: signingRoomId, title: "", webUrl: null }
      });
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

    if (kind !== "fillSign") {
      // If recipients are provided, create one flow per recipient (DocSpace creates one instance per opener anyway).
      if (recipientEmails.length) {
        const groupId = randomUUID();
        const created = [];
        for (const emailRaw of recipientEmails) {
          const email = normalize(emailRaw).toLowerCase();
          if (!email) continue;

          const userByEmail = await getUserByEmail(email, auth).catch(() => null);
          const recipientUserId = normalize(userByEmail?.id);
          const recipientName =
            userByEmail?.displayName ||
            [userByEmail?.firstName, userByEmail?.lastName].filter(Boolean).join(" ") ||
            userByEmail?.userName ||
            userByEmail?.email ||
            email;

          const flow = createFlow({
            id: randomUUID(),
            groupId,
            kind,
            templateFileId,
            templateTitle: templateInfo.title || null,
            fileId: String(templateInfo.id),
            fileTitle: templateInfo.title || null,
            projectRoomId: targetRoomId || null,
            createdByUserId: user?.id,
            recipientEmails: [email],
            recipientUserId: recipientUserId || null,
            recipientName: recipientName || null,
            createdByName: displayName || null,
            openUrl: fillLink.shareLink,
            linkRequestToken: fillLink?.requestToken || null,
            status: "InProgress"
          });
          if (flow) created.push(flow);
        }

        return res.json({ groupId, flow: created[0] || null, flows: created });
      }

      const flow = createFlow({
        id: randomUUID(),
        kind,
        templateFileId,
        templateTitle: templateInfo.title || null,
        fileId: String(templateInfo.id),
        fileTitle: templateInfo.title || null,
        projectRoomId: targetRoomId || null,
        createdByUserId: user?.id,
        recipientEmails,
        createdByName: displayName || null,
        openUrl: fillLink.shareLink,
        linkRequestToken: fillLink?.requestToken || null,
        status: "InProgress"
      });

      return res.json({ flow });
    }

    if (!recipientEmails.length) {
      return res.status(400).json({
        error: "Recipients are required",
        details: "Select at least one person to sign this request."
      });
    }

    const linkTitle = "Link to fill and sign";
    let signLink = await getFillOutLink(templateFileId, auth).catch(() => null);
    const needsTitle = !String(signLink?.title || "").toLowerCase().includes("fill") || !String(signLink?.title || "").toLowerCase().includes("sign");
    if (!signLink?.shareLink || needsTitle) {
      signLink =
        (await ensureExternalLinkAccess(templateFileId, { access: "ReadWrite", title: linkTitle }, auth).catch(() => null)) ||
        (await setFileExternalLink(templateFileId, auth, { access: "ReadWrite" }).catch(() => null)) ||
        signLink;
    }

    if (!signLink?.shareLink) {
      return res.status(500).json({ error: "Unable to obtain fill & sign link for the selected template" });
    }

    const groupId = randomUUID();
    const created = [];
    for (const emailRaw of recipientEmails) {
      const email = normalize(emailRaw).toLowerCase();
      if (!email) continue;

      const userByEmail = await getUserByEmail(email, auth).catch(() => null);
      const recipientUserId = normalize(userByEmail?.id);
      const recipientName =
        userByEmail?.displayName ||
        [userByEmail?.firstName, userByEmail?.lastName].filter(Boolean).join(" ") ||
        userByEmail?.userName ||
        userByEmail?.email ||
        email;

      const flow = createFlow({
        id: randomUUID(),
        groupId,
        kind: "fillSign",
        templateFileId,
        templateTitle: templateInfo.title || null,
        fileId: String(templateInfo.id),
        fileTitle: templateInfo.title || null,
        projectRoomId: targetRoomId || null,
        createdByUserId: user?.id,
        recipientEmails: [email],
        recipientUserId: recipientUserId || null,
        recipientName: recipientName || null,
        createdByName: displayName || null,
        openUrl: signLink.shareLink,
        linkRequestToken: signLink.requestToken || null,
        status: "InProgress"
      });
      if (flow) created.push(flow);
    }

    return res.json({ flow: created[0] || null, flows: created });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

export default router;
