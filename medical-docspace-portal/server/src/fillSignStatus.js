import { config } from "./config.js";
import {
  getFileInfo,
  getFolderByTitleWithin,
  getFolderContents,
  getFormsRoomFolders,
  getFillOutLink,
  requireFormsRoom,
  setFileExternalLink
} from "./docspaceClient.js";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function stripExtension(title) {
  const value = String(title || "").trim();
  if (!value) return "";
  return value.replace(/\.[a-z0-9]+$/i, "");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesInstanceTitle({ title, patientName, templateBase }) {
  const t = normalize(title).replace(/[–—]/g, "-").replace(/\s+/g, " ");
  const p = normalize(patientName).replace(/[–—]/g, "-").replace(/\s+/g, " ");
  const base = normalize(templateBase).replace(/[–—]/g, "-").replace(/\s+/g, " ");
  if (!t || !p || !base) return false;
  const directPrefix = `${p} -`;
  if (t.startsWith(directPrefix)) {
    return t.includes(base);
  }
  // Some portals prefix instance titles with an index like "5 - John Smith - Template".
  const numberedPrefix = new RegExp(`^\\d+\\s*-\\s*${escapeRegExp(p)}\\s*-\\s*`, "i");
  if (numberedPrefix.test(t)) {
    return t.includes(base);
  }
  return false;
}

async function resolveFormFolderId({ parentFolderId, templateTitle, cache }) {
  const base = stripExtension(templateTitle);
  const key = `${parentFolderId}:${normalize(base || templateTitle)}`;
  if (cache.has(key)) return cache.get(key);
  const contents = await getFolderContents(parentFolderId).catch(() => null);
  const folders = (contents?.items || []).filter((item) => item.type === "folder");
  const targetA = normalize(base || "");
  const targetB = normalize(templateTitle || "");
  const matches = folders
    .filter((f) => {
      const t = normalize(f.title);
      return (targetA && t === targetA) || (targetB && t === targetB);
    })
    .map((f) => String(f.id))
    .filter(Boolean);
  cache.set(key, matches);
  return matches;
}

async function listInstances({ folderIds, patientName, templateTitle, fileInfoCache }) {
  const ids = Array.isArray(folderIds) ? folderIds.filter(Boolean) : [];
  if (!ids.length) return [];
  const base = stripExtension(templateTitle);
  const instances = [];
  for (const folderId of ids) {
    const contents = await getFolderContents(folderId).catch(() => null);
    const files = (contents?.items || []).filter((item) => item.type === "file");
    const filtered = files.filter((file) =>
      matchesInstanceTitle({ title: file.title, patientName, templateBase: base })
    );
    for (const file of filtered) {
      const fid = String(file.id || "");
      if (!fid) continue;
      let info = fileInfoCache.get(fid);
      if (!info) {
        info = await getFileInfo(fid).catch(() => null);
        fileInfoCache.set(fid, info);
      }
      instances.push({
        id: fid,
        title: String(info?.title || file.title || ""),
        createdAt: String(info?.created || info?.createdAt || ""),
        formFillingStatus: info?.formFillingStatus ?? null,
        comment: info?.comment ?? null,
        folderId: String(folderId)
      });
    }
  }

  instances.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return instances;
}

async function ensurePublicViewLink(fileId) {
  const fillLink = await getFillOutLink(fileId).catch(() => null);
  if (fillLink?.shareLink) return fillLink;
  const external = await setFileExternalLink(String(fileId), "", { access: "Read" }).catch(() => null);
  return external?.shareLink ? external : null;
}

export async function resolveFillSignAssignments(assignments, { patientName } = {}) {
  const safePatientName = String(patientName || "").trim();
  if (!safePatientName) {
    return (assignments || []).map((a) => ({
      type: "file",
      assignmentId: a?.id,
      templateFileId: a?.templateFileId || null,
      title: a?.templateTitle || "Form",
      openUrl: a?.shareLink || null,
      status: "action",
      created: a?.createdAt || null,
      initiatedBy: a?.requestedBy || config.doctorEmail || "Doctor"
    }));
  }

  const room = await requireFormsRoom();
  const folders = await getFormsRoomFolders(room.id);
  const folderCache = new Map();
  const fileInfoCache = new Map();

  const byTemplate = new Map();
  for (const assignment of assignments || []) {
    const templateTitle = assignment?.templateTitle || "";
    const key = normalize(stripExtension(templateTitle) || templateTitle);
    if (!byTemplate.has(key)) byTemplate.set(key, []);
    byTemplate.get(key).push(assignment);
  }

  const results = [];

  for (const [, group] of byTemplate.entries()) {
    const sortedAssignments = [...group].sort((a, b) =>
      String(a?.createdAt || "").localeCompare(String(b?.createdAt || ""))
    );
    const templateTitle = sortedAssignments[0]?.templateTitle || "";
    const templateBase = stripExtension(templateTitle) || templateTitle;

    const inProcessFolderIds = await resolveFormFolderId({
      parentFolderId: folders.inProcess.id,
      templateTitle,
      cache: folderCache
    });
    const completeFolderIds = await resolveFormFolderId({
      parentFolderId: folders.complete.id,
      templateTitle,
      cache: folderCache
    });

    const inProcessInstances = await listInstances({
      folderIds: inProcessFolderIds,
      patientName: safePatientName,
      templateTitle: templateBase,
      fileInfoCache
    });
    const completeInstances = await listInstances({
      folderIds: completeFolderIds,
      patientName: safePatientName,
      templateTitle: templateBase,
      fileInfoCache
    });

    let completeIdx = 0;
    const inProcessCompleted = inProcessInstances.filter((item) => {
      if (normalize(item.formFillingStatus) === "complete") return true;
      return normalize(item.comment) === "submitted form";
    });
    const inProcessActive = inProcessInstances.filter(
      (item) => !inProcessCompleted.includes(item)
    );
    let inProcessCompletedIdx = 0;
    let inProcessActiveIdx = 0;

    for (const assignment of sortedAssignments) {
      const sentLink = assignment?.shareLink || null;

      if (completeIdx < completeInstances.length) {
        const instance = completeInstances[completeIdx++];
        const link = await ensurePublicViewLink(instance.id);
        results.push({
          ...assignment,
          status: "completed",
          instanceFileId: instance.id,
          instanceTitle: instance.title,
          instanceCreatedAt: instance.createdAt,
          openUrl: link?.shareLink || sentLink,
          linkRequestToken: link?.requestToken || null
        });
        continue;
      }

      // Sometimes DocSpace updates the instance status before moving it to the Complete folder.
      if (inProcessCompletedIdx < inProcessCompleted.length) {
        const instance = inProcessCompleted[inProcessCompletedIdx++];
        const link = await ensurePublicViewLink(instance.id);
        results.push({
          ...assignment,
          status: "completed",
          instanceFileId: instance.id,
          instanceTitle: instance.title,
          instanceCreatedAt: instance.createdAt,
          openUrl: link?.shareLink || sentLink,
          linkRequestToken: link?.requestToken || null
        });
        continue;
      }

      if (inProcessActiveIdx < inProcessActive.length) {
        const instance = inProcessActive[inProcessActiveIdx++];
        results.push({
          ...assignment,
          status: "action",
          instanceFileId: instance.id,
          instanceTitle: instance.title,
          instanceCreatedAt: instance.createdAt,
          openUrl: sentLink,
          linkRequestToken: null
        });
        continue;
      }

      results.push({
        ...assignment,
        status: "action",
        openUrl: sentLink,
        instanceFileId: null
      });
    }
  }

  results.sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));

  return results.map((item) => ({
    type: "file",
    assignmentId: item?.id,
    templateFileId: item?.templateFileId || null,
    title: item?.templateTitle || "Form",
    openUrl: item?.openUrl || null,
    status: item?.status || "action",
    instanceFileId: item?.instanceFileId || null,
    created: item?.createdAt || null,
    initiatedBy: item?.requestedBy || config.doctorEmail || "Doctor"
  }));
}
