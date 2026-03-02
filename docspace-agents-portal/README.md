# DocSpace Agents Portal (Sample)

Jotform-like agent builder + embeddable widget, where the agent's knowledge base is built from selected DocSpace rooms/folders, and actions are executed against DocSpace server-side.

## Stack

- **Server**: Node.js + Express + file-based JSON store
- **Client**: React + Vite (served via the same Express process)

## Run (local)

```powershell
cd d:\Workspace\massive-samples\DocSpace-Samples\docspace-agents-portal
copy .env.example .env
npm install
npm run dev
```

Open http://localhost:5190 (or your `PORT`)

## Environment (.env)

Required:

```
DOCSPACE_BASE_URL=https://your-docspace.example.com
```

Notes:

- `DOCSPACE_AUTH_TOKEN` is **optional**. If set, the server can run DocSpace actions as a service account (useful for public widgets and tools). If not set, Studio uses the logged-in DocSpace user's token.
- `DOCSPACE_AUTH_TOKEN` can be either a raw personal access token (sent as `Authorization: <token>`) or an explicit scheme value like `Bearer <jwt>`.

LLM (pick one):

```
LLM_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBED_MODEL=text-embedding-3-small
```

or

```
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.1
OLLAMA_EMBED_MODEL=nomic-embed-text
```

Optional:

```
PORT=5190
PUBLIC_BASE_URL=http://localhost:5190
DOCSPACE_MAX_FILE_BYTES=15000000
PUBLIC_FILE_TTL_SECONDS=86400
SESSION_TTL_SECONDS=604800
```

## Notes

- Studio authentication is done via DocSpace user credentials (server stores DocSpace token in an httpOnly cookie session).
- Public widget users do not need DocSpace accounts; file downloads are proxied through this server via signed short-lived links.
