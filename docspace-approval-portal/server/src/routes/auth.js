import { Router } from "express";
import {
  authenticateUser,
  findRoomByCandidates,
  getSelfProfileWithToken,
  requireFormsRoom
} from "../docspaceClient.js";
import { config } from "../config.js";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const token = await authenticateUser({ userName: email, password });
    if (!token) {
      return res.status(401).json({ error: "DocSpace authentication failed" });
    }

    const user = await getSelfProfileWithToken(token);

    const roomCandidates = [
      config.formsRoomTitle,
      ...(config.formsRoomTitleFallbacks || []),
      "Forms Room",
      "Medical Room",
      "Medical Forms"
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const formsRoom =
      (await findRoomByCandidates(roomCandidates, token).catch(() => null)) ||
      (await findRoomByCandidates(roomCandidates).catch(() => null)) ||
      (await requireFormsRoom(token).catch(() => null)) ||
      (await requireFormsRoom().catch(() => null)) ||
      null;

    res.json({ user, formsRoom, token });
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

