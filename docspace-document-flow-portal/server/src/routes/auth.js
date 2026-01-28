import { Router } from "express";
import {
  createDocSpaceUser,
  createCitizenRoom,
  createCitizenFolders,
  ensureRoomMembers,
  getSelfProfileWithToken,
  findRoomByCandidates,
  getRoomInfo,
  authenticateUser,
  updateMember
} from "../docspaceClient.js";

const router = Router();
const roomSuffix = " - Document Flow Room";

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const token = await authenticateUser({ userName: email, password });
    if (!token) {
      return res.status(401).json({ error: "DocSpace authentication failed" });
    }
    const user = await getSelfProfileWithToken(token);
    const displayName =
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.userName ||
      user.email;
    const emailPrefix = user.email ? user.email.split("@")[0] : "";
    const candidates = [
      displayName ? `${displayName}${roomSuffix}` : "",
      user.userName ? `${user.userName}${roomSuffix}` : "",
      user.email ? `${user.email}${roomSuffix}` : "",
      emailPrefix ? `${emailPrefix}${roomSuffix}` : ""
    ];

    let room = await findRoomByCandidates(candidates, token);
    if (!room) {
      room = await findRoomByCandidates(candidates);
    }

    if (room?.id) {
      try {
        await getRoomInfo(room.id, token);
      } catch (accessError) {
        if (accessError?.status === 403) {
          try {
            await ensureRoomMembers({ roomId: room.id, citizenId: user.id });
          } catch (shareError) {
            console.warn("[login] room share warning", shareError?.message || shareError);
          }
        }
      }
      try {
        const verified = await getRoomInfo(room.id, token);
        room = { ...room, ...verified };
      } catch (verifyError) {
        console.warn("[login] room verify warning", verifyError?.message || verifyError);
      }
    }

    res.json({ user, room, token });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { fullName, email, password, phone } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: "Full name, email, and password are required" });
    }
    let user = await createDocSpaceUser({ fullName, email, password });
    const room = await createCitizenRoom({ fullName });
    const folders = await createCitizenFolders({ roomId: room.id });
    const warnings = [];
    if (phone) {
      try {
        const updateResult = await updateMember({ userId: user.id, phone });
        user = updateResult.user || user;
        if (updateResult.warnings?.length) {
          warnings.push(...updateResult.warnings);
        }
      } catch (profileError) {
        warnings.push(profileError.message || "Failed to save phone number");
      }
    }
    try {
      await ensureRoomMembers({ roomId: room.id, citizenId: user.id });
    } catch (shareError) {
      warnings.push(shareError.message || "Failed to share room");
    }
    res.json({ user, room, folders, warnings });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

router.get("/session", (_req, res) => {
  res.status(501).json({ error: "Session storage disabled for local-only setup" });
});

export default router;
