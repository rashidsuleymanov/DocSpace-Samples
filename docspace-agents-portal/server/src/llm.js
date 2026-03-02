import { loadConfig } from "./config.js";

function tryExtractFirstJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      return JSON.parse(raw);
    } catch {
      // fall through
    }
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  const candidate = raw.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

export function createLlmHub() {
  const cfg = loadConfig();

  function resolveOpenAi({ apiKey, chatModel, embedModel } = {}) {
    return {
      apiKey: String(apiKey || cfg.llm.openai.apiKey || ""),
      chatModel: String(chatModel || cfg.llm.openai.chatModel || "gpt-4o-mini"),
      embedModel: String(embedModel || cfg.llm.openai.embedModel || "text-embedding-3-small")
    };
  }

  function resolveOllama({ baseUrl, chatModel, embedModel } = {}) {
    return {
      baseUrl: String(baseUrl || cfg.llm.ollama.baseUrl || "http://localhost:11434"),
      chatModel: String(chatModel || cfg.llm.ollama.chatModel || "llama3.1"),
      embedModel: String(embedModel || cfg.llm.ollama.embedModel || "nomic-embed-text")
    };
  }

  async function openaiChat({ system, messages, apiKey, chatModel, mode }) {
    const resolved = resolveOpenAi({ apiKey, chatModel });
    if (!resolved.apiKey) throw new Error("OPENAI_API_KEY is not set");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolved.apiKey}`
      },
      body: JSON.stringify({
        model: resolved.chatModel,
        temperature: 0.2,
        messages: [{ role: "system", content: system }, ...(messages || [])]
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || data?.message || res.statusText);
      err.status = res.status;
      err.details = data;
      throw err;
    }

    const content = data?.choices?.[0]?.message?.content || "";
    if (mode === "text") {
      return { mode: "text", text: String(content || "").trim() };
    }
    const parsed = tryExtractFirstJsonObject(content);
    if (parsed) return { mode: "json", json: parsed };
    return { mode: "json", json: { type: "answer", answer: String(content || "").trim(), links: [] } };
  }

  async function openaiEmbed(texts, { apiKey, embedModel } = {}) {
    const resolved = resolveOpenAi({ apiKey, embedModel });
    if (!resolved.apiKey) throw new Error("OPENAI_API_KEY is not set");
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolved.apiKey}`
      },
      body: JSON.stringify({
        model: resolved.embedModel,
        input: texts
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || data?.message || res.statusText);
      err.status = res.status;
      err.details = data;
      throw err;
    }
    return (data?.data || []).map((d) => d.embedding);
  }

  async function ollamaChat({ system, messages, baseUrl, chatModel, mode }) {
    const resolved = resolveOllama({ baseUrl, chatModel });
    const url = `${resolved.baseUrl.replace(/\/+$/, "")}/api/chat`;
    const body = {
      model: resolved.chatModel,
      stream: false,
      messages: [{ role: "system", content: system }, ...(messages || [])]
    };
    if (mode === "json") {
      body.format = "json";
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error || res.statusText);
      err.status = res.status;
      err.details = data;
      throw err;
    }
    const content = data?.message?.content || "";
    if (mode === "text") {
      return { mode: "text", text: String(content || "").trim() };
    }
    const parsed = tryExtractFirstJsonObject(content);
    if (parsed) return { mode: "json", json: parsed };
    return { mode: "json", json: { type: "answer", answer: String(content || "").trim(), links: [] } };
  }

  async function ollamaEmbed(texts, { baseUrl, embedModel } = {}) {
    const resolved = resolveOllama({ baseUrl, embedModel });
    const base = resolved.baseUrl.replace(/\/+$/, "");
    const model = resolved.embedModel;

    // Try modern /api/embed (batch) first.
    try {
      const res = await fetch(`${base}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: texts })
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const embeddings = data?.embeddings || data?.data || null;
        if (Array.isArray(embeddings)) return embeddings;
      }
    } catch {
      // ignore and fallback
    }

    // Fallback: /api/embeddings (single prompt)
    const out = [];
    for (const t of texts) {
      const res = await fetch(`${base}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: t })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data?.error || res.statusText);
        err.status = res.status;
        err.details = data;
        throw err;
      }
      out.push(data?.embedding || []);
    }
    return out;
  }

  return {
    cfg,
    async chat({ provider, mode = "json", system, messages, openai, ollama }) {
      const p = provider === "ollama" ? "ollama" : "openai";
      return p === "ollama"
        ? ollamaChat({ system, messages, mode, ...(ollama || {}) })
        : openaiChat({ system, messages, mode, ...(openai || {}) });
    },
    async embed({ provider, texts, openai, ollama }) {
      const p = provider === "ollama" ? "ollama" : "openai";
      return p === "ollama" ? ollamaEmbed(texts, ollama) : openaiEmbed(texts, openai);
    }
  };
}
