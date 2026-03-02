import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.string().optional(),

  DOCSPACE_BASE_URL: z.string().url(),
  // Optional service token. If set, the server can perform DocSpace actions
  // on behalf of a "bot/service account" without needing a logged-in user session.
  DOCSPACE_AUTH_TOKEN: z.string().optional(),
  DOCSPACE_MAX_FILE_BYTES: z.coerce.number().int().positive().optional().default(15_000_000),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().optional().default(60 * 60 * 24 * 7),

  PUBLIC_BASE_URL: z.string().url().optional(),
  PUBLIC_FILE_TTL_SECONDS: z.coerce.number().int().positive().optional().default(86_400),

  LLM_PROVIDER: z.enum(["openai", "ollama"]).optional().default("ollama"),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().optional().default("gpt-4o-mini"),
  OPENAI_EMBED_MODEL: z.string().optional().default("text-embedding-3-small"),

  OLLAMA_BASE_URL: z.string().url().optional().default("http://localhost:11434"),
  OLLAMA_CHAT_MODEL: z.string().optional().default("llama3.1"),
  OLLAMA_EMBED_MODEL: z.string().optional().default("nomic-embed-text")
});

export function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    const err = new Error(`Invalid .env configuration:\n- ${errors.join("\n- ")}`);
    err.details = errors;
    throw err;
  }

  const cfg = parsed.data;
  const port = Number(cfg.PORT || 5190);
  const publicBaseUrlLocked = Boolean(cfg.PUBLIC_BASE_URL);
  const publicBaseUrl = cfg.PUBLIC_BASE_URL || `http://localhost:${port}`;

  return {
    isProd: cfg.NODE_ENV === "production",
    port,
    docspace: {
      baseUrl: cfg.DOCSPACE_BASE_URL.replace(/\/+$/, ""),
      authToken: String(cfg.DOCSPACE_AUTH_TOKEN || "").trim(),
      maxFileBytes: cfg.DOCSPACE_MAX_FILE_BYTES
    },
    sessionTtlSeconds: cfg.SESSION_TTL_SECONDS,
    publicBaseUrl,
    publicBaseUrlLocked,
    publicFileTtlSeconds: cfg.PUBLIC_FILE_TTL_SECONDS,
    llm: {
      provider: cfg.LLM_PROVIDER,
      openai: {
        apiKey: cfg.OPENAI_API_KEY || "",
        chatModel: cfg.OPENAI_CHAT_MODEL,
        embedModel: cfg.OPENAI_EMBED_MODEL
      },
      ollama: {
        baseUrl: cfg.OLLAMA_BASE_URL,
        chatModel: cfg.OLLAMA_CHAT_MODEL,
        embedModel: cfg.OLLAMA_EMBED_MODEL
      }
    }
  };
}
