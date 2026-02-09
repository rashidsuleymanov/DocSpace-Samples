import { Router } from "express";
import {
  authenticateUser,
  createUser,
  findRoomByCandidates,
  getSelfProfileWithToken,
  requireFormsRoom
} from "../docspaceClient.js";
import { getConfig } from "../config.js";

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

    const cfg = getConfig();
    const roomCandidates = [
      cfg.formsRoomTitle,
      ...(cfg.formsRoomTitleFallbacks || []),
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

router.post("/register", async (req, res) => {
  try {
    const cfg = getConfig();
    if (!String(cfg.rawAuthToken || "").trim()) {
      return res.status(501).json({
        error: "Registration is not configured.",
        details: "Open Settings and set an admin Authorization token first."
      });
    }

    const { firstName, lastName, email, password } = req.body || {};
    const em = String(email || "").trim();
    const pw = String(password || "").trim();
    if (!em || !pw) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    await createUser({
      firstName: String(firstName || "").trim(),
      lastName: String(lastName || "").trim(),
      email: em,
      password: pw
    });

    // Auto-login after successful creation.
    const token = await authenticateUser({ userName: em, password: pw });
    if (!token) {
      return res.status(201).json({ ok: true });
    }

    const user = await getSelfProfileWithToken(token);
    res.status(201).json({ user, token });
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
