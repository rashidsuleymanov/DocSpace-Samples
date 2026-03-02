import { randomToken } from "./security.js";
import { nowIso } from "./store.js";

export function listToolSpecs() {
  return [
    {
      name: "docspace_list_rooms",
      description: "List DocSpace rooms (only allowed when allowAllDocSpace is enabled).",
      args: {}
    },
    {
      name: "docspace_list_folder_contents",
      description: "List a room or folder contents by id.",
      args: { id: "string" }
    },
    {
      name: "docspace_create_room",
      description: "Create a new DocSpace room (only allowed when allowAllDocSpace is enabled).",
      args: { title: "string" }
    },
    {
      name: "docspace_create_folder",
      description: "Create a folder under a room/folder.",
      args: { parentId: "string", title: "string" }
    },
    {
      name: "docspace_create_document",
      description: "Create an empty document under a folder.",
      args: { folderId: "string", title: "string" }
    },
    {
      name: "docspace_upload_file_base64",
      description: "Upload a file to a folder from base64 content.",
      args: { folderId: "string", fileName: "string", base64: "string", contentType: "string?" }
    },
    {
      name: "docspace_move_file",
      description: "Move a file into a folder.",
      args: { fileId: "string", destFolderId: "string" }
    },
    {
      name: "docspace_publish_file_download",
      description: "Create a signed external download URL (keeps DocSpace hidden).",
      args: { fileId: "string", title: "string?" }
    }
  ];
}

function requireAllowed({ rag, agentId, tools, itemType, itemId }) {
  if (tools?.allowAllDocSpace) return;
  if (!rag.isAllowed(agentId, itemType, itemId)) {
    const err = new Error("Action is not allowed for this agent");
    err.status = 403;
    throw err;
  }
}

function requireAllowAll(tools) {
  if (tools?.allowAllDocSpace) return;
  const err = new Error("Action requires allowAllDocSpace");
  err.status = 403;
  throw err;
}

export function createToolExecutor({ cfg, store, docspace, rag }) {

  async function publishFile({ agentId, fileId, title, contentType = "application/octet-stream" }) {
    const token = `pf_${randomToken(22)}`;
    const expiresAt = new Date(Date.now() + cfg.publicFileTtlSeconds * 1000).toISOString();
    store.state.publicFiles = store.state.publicFiles || [];
    store.state.publicFiles.push({
      token,
      agentId: String(agentId),
      fileId: String(fileId),
      title: String(title || `file-${fileId}`),
      contentType: String(contentType || "application/octet-stream"),
      createdAt: nowIso(),
      expiresAt,
      downloads: 0
    });
    store.save();
    const url = `${String(cfg.publicBaseUrl || "").replace(/\/+$/, "")}/public/file/${token}`;
    return { url, expiresAt };
  }

  async function runTool({ agentId, tools, name, args }) {
    store.audit(agentId, "tool_call", { name, args });
    switch (name) {
      case "docspace_list_rooms": {
        requireAllowAll(tools);
        const rooms = await docspace.getRooms();
        return { rooms: rooms.map((r) => ({ id: String(r.id), title: r.title || r.name || "" })) };
      }
      case "docspace_list_folder_contents": {
        const id = String(args?.id || "").trim();
        if (!id) throw new Error("id is required");
        requireAllowed({ rag, agentId, tools, itemType: "folder", itemId: id });
        const contents = await docspace.getFolderContents(id);
        return { contents };
      }
      case "docspace_create_room": {
        requireAllowAll(tools);
        const title = String(args?.title || "").trim();
        if (!title) throw new Error("title is required");
        const created = await docspace.createRoom({ title });
        return { room: created };
      }
      case "docspace_create_folder": {
        const parentId = String(args?.parentId || "").trim();
        const title = String(args?.title || "").trim();
        if (!parentId || !title) throw new Error("parentId and title are required");
        requireAllowed({ rag, agentId, tools, itemType: "folder", itemId: parentId });
        const created = await docspace.createFolder({ parentId, title });
        if (created?.id) rag.addAllowed(agentId, "folder", created.id);
        return { folder: created };
      }
      case "docspace_create_document": {
        const folderId = String(args?.folderId || "").trim();
        const title = String(args?.title || "").trim();
        if (!folderId || !title) throw new Error("folderId and title are required");
        requireAllowed({ rag, agentId, tools, itemType: "folder", itemId: folderId });
        const file = await docspace.createEmptyDoc({ folderId, title });
        if (file?.id) rag.addAllowed(agentId, "file", file.id);
        const published = file?.id
          ? await publishFile({ agentId, fileId: file.id, title, contentType: "application/octet-stream" }).catch(() => null)
          : null;
        return { file, published };
      }
      case "docspace_upload_file_base64": {
        const folderId = String(args?.folderId || "").trim();
        const fileName = String(args?.fileName || "").trim();
        const base64 = String(args?.base64 || "").trim();
        const contentType = String(args?.contentType || "application/octet-stream");
        if (!folderId || !fileName || !base64) throw new Error("folderId, fileName, base64 are required");
        requireAllowed({ rag, agentId, tools, itemType: "folder", itemId: folderId });
        const buffer = Buffer.from(base64, "base64");
        const uploaded = await docspace.uploadFileToFolder({ folderId, fileName, buffer, contentType });
        return { uploaded };
      }
      case "docspace_move_file": {
        const fileId = String(args?.fileId || "").trim();
        const destFolderId = String(args?.destFolderId || "").trim();
        if (!fileId || !destFolderId) throw new Error("fileId and destFolderId are required");
        requireAllowed({ rag, agentId, tools, itemType: "file", itemId: fileId });
        requireAllowed({ rag, agentId, tools, itemType: "folder", itemId: destFolderId });
        const moved = await docspace.moveFileToFolder({ fileId, destFolderId });
        return { moved };
      }
      case "docspace_publish_file_download": {
        const fileId = String(args?.fileId || "").trim();
        const title = String(args?.title || "").trim();
        if (!fileId) throw new Error("fileId is required");
        requireAllowed({ rag, agentId, tools, itemType: "file", itemId: fileId });
        const info = await docspace.getFileInfo(fileId).catch(() => null);
        const contentType = info?.contentType || "application/octet-stream";
        const out = await publishFile({
          agentId,
          fileId,
          title: title || info?.title || `file-${fileId}`,
          contentType
        });
        return { published: out };
      }
      default: {
        const err = new Error(`Unknown tool: ${name}`);
        err.status = 400;
        throw err;
      }
    }
  }

  return { runTool };
}
