import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import net from "net";
import authRoutes from "./routes/auth.js";
import patientRoutes from "./routes/patients.js";
import doctorRoutes from "./routes/doctor.js";
import debugRoutes from "./routes/debug.js";
import demoRoutes from "./routes/demo.js";
import { validateConfig } from "./config.js";
import {
  cleanupStoredDemoSessions,
  flushDemoSessions,
  getDemoSessionById,
  getDemoSessionId,
  hydrateDemoSessions,
  listDemoSessions,
  touchDemoSession,
  startDemoJanitor
} from "./demoSessionStore.js";
import { cleanupDemoSession } from "./routes/demoCleanup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "35mb" }));

app.use((req, _res, next) => {
  const sid = getDemoSessionId(req);
  const session = sid ? getDemoSessionById(sid) : null;
  if (session) {
    req.demoSession = session;
    touchDemoSession(session);
  } else {
    req.demoSession = null;
  }
  next();
});

const configErrors = validateConfig({ requiresAuth: true });
if (configErrors.length) {
  console.warn("[medical-portal] config warnings:");
  configErrors.forEach((message) => console.warn(`- ${message}`));
}

app.use("/api/demo", demoRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/doctor", doctorRoutes);

const isProd = process.env.NODE_ENV === "production";
const debugEnabled = process.env.ENABLE_DEBUG_API === "true" || !isProd;
if (debugEnabled) {
  app.use("/api/debug", debugRoutes);
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "Request body is too large" });
  }
  console.error("[medical-portal] unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
});

const clientRoot = path.resolve(__dirname, "../../client");
const DEFAULT_PORT = 5173;
const rawPort = process.env.PORT;
const parsedPort = rawPort ? Number(rawPort) : null;
const hasExplicitPort = rawPort != null && rawPort !== "";
const requestedPort =
  parsedPort && Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : null;

function isPortAvailable(portToCheck) {
  return new Promise((resolve, reject) => {
    const tryListen = (host, fallback) => {
      const tester = net.createServer();
      tester.once("error", (err) => {
        if (!err) reject(err);
        if (err.code === "EADDRINUSE") {
          resolve(false);
          return;
        }
        if (
          fallback &&
          (err.code === "EADDRNOTAVAIL" || err.code === "EAFNOSUPPORT" || err.code === "EINVAL")
        ) {
          fallback();
          return;
        }
        reject(err);
      });
      tester.once("listening", () => {
        tester.close(() => resolve(true));
      });
      tester.listen(portToCheck, host);
    };

    // Match express default binding (IPv6 any / IPv4 any), otherwise we may falsely detect the port as free on Windows.
    tryListen("::", () => tryListen("0.0.0.0"));
  });
}

async function start() {
  await hydrateDemoSessions();
  const recovered = listDemoSessions();
  if (recovered.length) {
    console.warn(`[medical-portal] Found ${recovered.length} stale demo session(s). Running startup cleanup.`);
    await cleanupStoredDemoSessions({ onCleanup: cleanupDemoSession });
  }

  if (hasExplicitPort && requestedPort == null) {
    console.error(`[medical-portal] Invalid PORT value: ${JSON.stringify(rawPort)}`);
    console.error("[medical-portal] Set PORT to an integer between 1 and 65535.");
    process.exit(1);
  }

  const basePort = requestedPort ?? DEFAULT_PORT;
  let selectedPort = basePort;

  if (requestedPort != null) {
    const available = await isPortAvailable(selectedPort);
    if (!available) {
      console.error(`[medical-portal] Port ${selectedPort} is already in use.`);
      console.error("[medical-portal] Stop the other process, or set PORT=<free port> in your .env.");
      process.exit(1);
    }
  } else {
    for (let offset = 0; offset < 20; offset += 1) {
      const candidate = DEFAULT_PORT + offset;
      const available = await isPortAvailable(candidate);
      if (available) {
        selectedPort = candidate;
        break;
      }
    }
    if (selectedPort !== DEFAULT_PORT) {
      console.warn(`[medical-portal] Port ${DEFAULT_PORT} is busy. Using ${selectedPort} instead.`);
      console.warn("[medical-portal] Set PORT=<free port> in your .env to pin the port.");
    }
  }

  const httpServer = http.createServer(app);
  let shuttingDown = false;

  const cleanupLiveDemoSessions = async (reason) => {
    const active = listDemoSessions();
    if (!active.length) {
      await flushDemoSessions();
      return;
    }
    console.warn(`[medical-portal] ${reason}: cleaning ${active.length} active demo session(s).`);
    await cleanupStoredDemoSessions({ onCleanup: cleanupDemoSession });
  };

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await cleanupLiveDemoSessions(signal);
    } catch (error) {
      console.warn("[medical-portal] shutdown demo cleanup failed", error?.message || error);
    }
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5_000).unref?.();
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  if (!isProd) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: clientRoot,
      server: {
        middlewareMode: true,
        allowedHosts: [".ngrok-free.app"],
        hmr: { server: httpServer }
      },
      appType: "spa"
    });

    app.use(vite.middlewares);

    app.use("*", async (req, res, next) => {
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(path.resolve(clientRoot, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (error) {
        vite.ssrFixStacktrace(error);
        next(error);
      }
    });
  } else {
    app.use(express.static(path.join(clientRoot, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientRoot, "dist", "index.html"));
    });
  }

  httpServer.listen(selectedPort, () => {
    console.log(`[medical-portal] ${isProd ? "prod" : "dev"} on http://localhost:${selectedPort}`);
  });

  httpServer.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      console.error(`[medical-portal] Port ${selectedPort} is already in use.`);
      console.error("[medical-portal] Stop the other process, or set PORT=<free port> in your .env.");
      process.exit(1);
    }
    console.error("[medical-portal] server error", err);
  });
}

start().catch((error) => {
  console.error("[medical-portal] failed to start", error);
  process.exit(1);
});

startDemoJanitor({ onExpire: cleanupDemoSession });
