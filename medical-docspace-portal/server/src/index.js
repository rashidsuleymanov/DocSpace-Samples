import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import authRoutes from "./routes/auth.js";
import patientRoutes from "./routes/patients.js";
import doctorRoutes from "./routes/doctor.js";
import debugRoutes from "./routes/debug.js";
import { validateConfig } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");
app.use(express.json());

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
  console.error("[medical-portal] unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
});

const clientRoot = path.resolve(__dirname, "../../client");
const port = process.env.PORT || 5173;

async function start() {
  if (!isProd) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: clientRoot,
      server: {
        middlewareMode: true,
        allowedHosts: [".ngrok-free.app"]
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

  app.listen(port, () => {
    console.log(`[medical-portal] ${isProd ? "prod" : "dev"} on http://localhost:${port}`);
  });
}

start();
