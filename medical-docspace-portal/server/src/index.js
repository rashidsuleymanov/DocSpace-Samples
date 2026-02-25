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
import { validateConfig } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "35mb" }));

const configErrors = validateConfig({ requiresAuth: true });
if (configErrors.length) {
  console.warn("[medical-portal] config warnings:");
  configErrors.forEach((message) => console.warn(`- ${message}`));
}

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

start();
