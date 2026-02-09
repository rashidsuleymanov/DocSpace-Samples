import { Router } from "express";
import { getFolderContents, getFormsRoomFolders, requireFormsRoom } from "../docspaceClient.js";
import { getConfig } from "../config.js";

const router = Router();

function isPdfItem(item) {
  if (!item) return false;
  const ext = String(item?.fileExst || "").trim().toLowerCase();
  const title = String(item?.title || "").trim().toLowerCase();
  if (ext === "pdf" || ext === ".pdf") return true;
  if (title.endsWith(".pdf")) return true;
  return false;
}

router.get("/", async (req, res) => {
  try {
    const auth = String(req.headers.authorization || "").trim();
    if (!auth) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const cfg = getConfig();
    if (!String(cfg.formsRoomId || "").trim()) {
      return res.status(400).json({
        error: "No current project selected",
        details: "Open Projects and select (or create) a project first."
      });
    }

    const room =
      (await requireFormsRoom(auth).catch(() => null)) ||
      (await requireFormsRoom().catch(() => null));
    if (!room?.id) {
      return res.status(404).json({ error: "Forms room not found" });
    }

    const folders =
      (await getFormsRoomFolders(room.id, auth).catch(() => null)) ||
      (await getFormsRoomFolders(room.id).catch(() => null)) ||
      null;

    const folderId = folders?.templates?.id || room.id;
    const contents =
      (await getFolderContents(folderId, auth).catch(() => null)) ||
      (await getFolderContents(folderId).catch(() => null));

    const items = Array.isArray(contents?.items) ? contents.items : [];
    const templates = items
      .filter((item) => item.type === "file" && isPdfItem(item))
      .map((item) => ({
        id: item.id,
        title: item.title,
        fileExst: item.fileExst || null,
        isForm: item.isForm ?? null
      }));

    res.json({
      room: { id: room.id, title: room.title },
      folder: {
        id: folderId,
        title: folders?.templates?.title || contents?.title || null
      },
      templates
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

export default router;
