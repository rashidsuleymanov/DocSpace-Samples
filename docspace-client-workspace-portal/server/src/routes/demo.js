import { Router } from "express";
import {
  authenticateUser,
  createDocSpaceUser,
  createCitizenFolders,
  createCitizenRoom,
  createFolderDocument,
  ensureRoomFolderByTitle,
  getRoomInfo,
  shareRoom
} from "../docspaceClient.js";
import { config } from "../config.js";
import {
  clearDemoSessionCookie,
  createDemoSession,
  deleteDemoSession,
  setDemoSessionCookie
} from "../demoSessionStore.js";
import { createRequestRecord } from "../store.js";

const router = Router();

function normalizeEmailDomain(value) {
  const raw = String(value || "").trim();
  if (!raw) return "demo.local";
  return raw.replace(/^@+/, "");
}

function randomPassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%^&*()-_=+[]{}";
  const all = upper + lower + digits + special;
  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)]
  ];

  while (chars.length < 16) {
    chars.push(all[Math.floor(Math.random() * all.length)]);
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function buildEmail({ sessionId, role }) {
  const domain = normalizeEmailDomain(config.demoEmailDomain);
  const slug = String(sessionId || "").replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase() || "demo";
  return `demo+${slug}-${role}@${domain}`;
}

function sanitizeNameParts(value, fallbackFirst, fallbackLast) {
  const raw = String(value || "").trim();
  const cleaned = raw.replace(/[^A-Za-z\\s-]/g, " ").replace(/\\s+/g, " ").trim();
  const parts = cleaned.split(" ").filter(Boolean);
  const firstName = parts[0] || fallbackFirst;
  const lastName = parts.slice(1).join(" ") || fallbackLast;
  return { firstName, lastName };
}

function buildSafeFullName(value, fallbackFirst, fallbackLast) {
  const { firstName, lastName } = sanitizeNameParts(value, fallbackFirst, fallbackLast);
  return `${firstName} ${lastName}`.trim();
}

function userSafe(user, options = {}) {
  if (!user) return null;
  const displayName =
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.userName ||
    user.email;
  return {
    id: user.id,
    displayName,
    email: user.email || "",
    title: options.title || user.title || ""
  };
}

function roomSafe(room) {
  if (!room?.id) return null;
  return {
    id: room.id,
    title: room.title || "Client Workspace",
    webUrl: room.webUrl || room.shortWebUrl || null
  };
}

async function seedWorkspace(roomId, clientName) {
  const welcome = await createFolderDocument({
    folderId: (await ensureRoomFolderByTitle(roomId, "Shared Documents")).id,
    title: `Welcome Brief - ${clientName}.docx`
  }).catch(() => null);

  const proposal = await createFolderDocument({
    folderId: (await ensureRoomFolderByTitle(roomId, "Shared Documents")).id,
    title: "Commercial Proposal.docx"
  }).catch(() => null);

  await createFolderDocument({
    folderId: (await ensureRoomFolderByTitle(roomId, "Action Items")).id,
    title: "Requested Billing Details.docx"
  }).catch(() => null);

  return { welcome, proposal };
}

function buildRoomInvitations({ clientUser, managerUser }) {
  return [
    { id: String(clientUser.id), access: config.patientAccess },
    { id: String(managerUser.id), access: config.officerAccess }
  ];
}

function fallbackInvitationsToEditing(invitations) {
  return (invitations || []).map((item) => ({
    ...item,
    access: "Editing"
  }));
}

router.get("/session", (req, res) => {
  const session = req.demoSession || null;
  if (!session) {
    return res.status(204).end();
  }

  return res.json({
    sessionId: session.id,
    client: {
      user: userSafe(session.client?.user, { title: "Client contact" }),
      token: session.client?.token || null,
      room: roomSafe(session.client?.room)
    },
    manager: {
      user: userSafe(session.manager?.user, { title: config.managerTitle }),
      token: session.manager?.token || null
    }
  });
});

router.get("/credentials", (req, res) => {
  const session = req.demoSession || null;
  const role = String(req.query.role || "client").toLowerCase();
  const source = role === "manager" ? session?.manager : session?.client;
  const email = source?.user?.email || null;
  const password = source?.password || null;
  if (!email || !password) {
    return res.status(404).json({ error: "Credentials not available" });
  }
  return res.json({ email, password });
});

router.post("/start", async (req, res) => {
  const existing = req.demoSession || null;
  if (existing?.id) {
    deleteDemoSession(existing.id);
    clearDemoSessionCookie(res);
  }

  const session = createDemoSession();

  try {
    const clientName = buildSafeFullName(req.body?.clientName, "Avery", "Parker");
    const companyName = String(req.body?.companyName || "Northwind Labs").trim() || "Northwind Labs";
    const managerName = buildSafeFullName(req.body?.managerName, "Morgan", "Lee");

    const clientEmail = buildEmail({ sessionId: session.id, role: "client" });
    const managerEmail = buildEmail({ sessionId: session.id, role: "manager" });
    const clientPassword = randomPassword();
    const managerPassword = randomPassword();

    const clientUser = await createDocSpaceUser({
      fullName: clientName,
      email: clientEmail,
      password: clientPassword
    });
    const managerUser = await createDocSpaceUser({
      fullName: managerName,
      email: managerEmail,
      password: managerPassword
    });

    const [clientToken, managerToken] = await Promise.all([
      authenticateUser({ userName: clientEmail, password: clientPassword }),
      authenticateUser({ userName: managerEmail, password: managerPassword })
    ]);

    const room = await createCitizenRoom({ fullName: companyName });
    await createCitizenFolders({ roomId: room.id });

    const invitations = buildRoomInvitations({ clientUser, managerUser });
    try {
      await shareRoom({
        roomId: room.id,
        invitations,
        notify: false
      });
    } catch (error) {
      const roleUnavailable =
        error?.status === 403 &&
        String(error?.details?.error?.message || error?.message || "")
          .toLowerCase()
          .includes("role is not available");
      if (!roleUnavailable) {
        throw error;
      }
      await shareRoom({
        roomId: room.id,
        invitations: fallbackInvitationsToEditing(invitations),
        notify: false
      });
    }

    await seedWorkspace(room.id, clientName);

    createRequestRecord({
      roomId: String(room.id),
      title: "Complete onboarding pack",
      periodFrom: new Date().toISOString().slice(0, 10),
      periodTo: "",
      requiredDocuments: ["Signed NDA", "Billing contact sheet"],
      folder: await ensureRoomFolderByTitle(room.id, "Action Items").catch(() => null)
    });

    const verifiedRoom = await getRoomInfo(room.id).catch(() => room);

    session.client = {
      userId: String(clientUser.id),
      password: clientPassword,
      token: clientToken,
      user: clientUser,
      room: verifiedRoom
    };
    session.manager = {
      userId: String(managerUser.id),
      password: managerPassword,
      token: managerToken,
      user: managerUser
    };

    setDemoSessionCookie(res, session.id);

    return res.json({
      sessionId: session.id,
      client: {
        user: userSafe(clientUser, { title: "Client contact" }),
        token: clientToken,
        room: roomSafe(verifiedRoom)
      },
      manager: {
        user: userSafe(managerUser, { title: config.managerTitle }),
        token: managerToken
      }
    });
  } catch (error) {
    deleteDemoSession(session.id);
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/end", (req, res) => {
  const session = req.demoSession || null;
  if (session?.id) {
    deleteDemoSession(session.id);
  }
  clearDemoSessionCookie(res);
  return res.json({ ok: true });
});

export default router;
