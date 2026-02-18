import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import authRoutes from "./routes/auth.js";
import templatesRoutes from "./routes/templates.js";
import flowsRoutes from "./routes/flows.js";
import debugRoutes from "./routes/debug.js";
import sandboxRoutes from "./routes/sandbox.js";
import projectsRoutes from "./routes/projects.js";
import libraryRoutes from "./routes/library.js";
import draftsRoutes from "./routes/drafts.js";
import webhooksRoutes from "./routes/webhooks.js";
import contactsRoutes from "./routes/contacts.js";
import linksRoutes from "./routes/links.js";
import directoryRoutes from "./routes/directory.js";
import { validateConfig } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })
);

const configErrors = validateConfig({ requiresAuth: true });
if (configErrors.length) {
  console.warn("[approval-portal] config warnings:");
  configErrors.forEach((message) => console.warn(`- ${message}`));
}

app.use("/api/auth", authRoutes);
app.use("/api/templates", templatesRoutes);
app.use("/api/flows", flowsRoutes);
app.use("/api/settings", sandboxRoutes);
app.use("/api/sandbox", sandboxRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/drafts", draftsRoutes);
app.use("/api/webhooks", webhooksRoutes);
app.use("/api/contacts", contactsRoutes);
app.use("/api/links", linksRoutes);
app.use("/api/directory", directoryRoutes);

const isProd = process.env.NODE_ENV === "production";
const debugEnabled = process.env.ENABLE_DEBUG_API === "true";
if (debugEnabled) app.use("/api/debug", debugRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use((err, _req, res, _next) => {
  console.error("[approval-portal] unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
});

const clientRoot = path.resolve(__dirname, "../../client");
const port = process.env.PORT || 8080;

async function start() {
  if (!isProd) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: clientRoot,
      server: { middlewareMode: true },
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
    console.log(`[approval-portal] ${isProd ? "prod" : "dev"} on http://localhost:${port}`);
  });
}

start();
