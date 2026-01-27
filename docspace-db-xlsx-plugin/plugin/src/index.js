const editorFrameId = "docspace-plugin-hidden-editor";

let sdkLoaderPromise = null;
let editorInstance = null;

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/$/, "");
}

async function loadDocSpaceSdk(baseUrl) {
  if (sdkLoaderPromise) return sdkLoaderPromise;
  const src = normalizeBaseUrl(baseUrl);
  sdkLoaderPromise = new Promise((resolve, reject) => {
    if (window.DocSpace?.SDK) return resolve(window.DocSpace.SDK);
    const script = document.createElement("script");
    script.src = `${src}/static/scripts/sdk/2.0.0/api.js`;
    script.async = true;
    script.onload = () => resolve(window.DocSpace?.SDK);
    script.onerror = () => reject(new Error("Failed to load DocSpace SDK"));
    document.head.appendChild(script);
  });
  return sdkLoaderPromise;
}

function destroyEditor() {
  try { editorInstance?.destroy?.(); } catch {}
  editorInstance = null;
}

function logLine(label, data) {
  const log = document.getElementById("log");
  const ts = new Date().toISOString();
  const line = data === undefined ? `${ts} ${label}` : `${ts} ${label}\n${safeStringify(data)}\n`;
  log.textContent = `${line}\n${log.textContent}`;
}

function safeStringify(v) {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function apiPost(baseUrl, path, body) {
  return fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || res.statusText);
    }
    return data;
  });
}

function apiGet(baseUrl, path) {
  return fetch(`${normalizeBaseUrl(baseUrl)}${path}`).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || res.statusText);
    return data;
  });
}

function getDbConfig() {
  return {
    connectionString: document.getElementById("dbConnectionString").value.trim(),
    hostaddr: document.getElementById("dbHostaddr").value.trim(),
    host: document.getElementById("dbHost").value.trim(),
    port: document.getElementById("dbPort").value.trim(),
    database: document.getElementById("dbName").value.trim(),
    user: document.getElementById("dbUser").value.trim(),
    password: document.getElementById("dbPassword").value,
    ssl: document.getElementById("dbSsl").value === "true"
  };
}

function getBackendUrl() {
  return document.getElementById("backendUrl").value.trim();
}

function getLimit() {
  return document.getElementById("rowLimit").value.trim();
}

function getSelectedTable() {
  return document.getElementById("tablesSelect").value;
}

async function getDocSpaceContext() {
  const sdk = window.DocSpace?.SDK;
  if (!sdk?.getContext) {
    throw new Error("DocSpace SDK context is not available");
  }
  const ctx = await sdk.getContext();
  return ctx || {};
}

function resolveRoomId(ctx) {
  return ctx?.room?.id || ctx?.context?.roomId || ctx?.context?.id || "";
}

function makeFileName(tableRef) {
  const safe = String(tableRef || "export").replace(/[^a-zA-Z0-9_.-]+/g, "_").replace(/\./g, "_");
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${safe}-${yyyy}${mm}${dd}-${hh}${mi}.xlsx`;
}

function buildEditorCommand(rows) {
  const payload = JSON.stringify(rows || []);
  return new Function(
    "editorInstance",
    `
      try {
        const rows = ${payload};
        const connector = editorInstance?.createConnector?.();
        if (!connector?.callCommand) {
          console.error("connector.callCommand is not available", connector);
          return;
        }
        Asc.scope.rows = rows;
        connector.callCommand(function () {
          try {
            const data = Asc.scope.rows || [];
            const sheet = Api.GetActiveSheet();
            if (!sheet) return;
            if (!data.length) {
              sheet.GetRange("A1").SetValue("No data");
              Api.Save();
              return;
            }
            const headers = Object.keys(data[0] || {});
            const table = [headers];
            for (let i = 0; i < data.length; i += 1) {
              const row = data[i] || {};
              table.push(headers.map((h) => row[h] ?? ""));
            }
            const height = table.length;
            const width = headers.length;
            const lastColCode = "A".charCodeAt(0) + Math.max(0, width - 1);
            const lastCol = String.fromCharCode(lastColCode);
            const rangeRef = "A1:" + lastCol + String(height);
            sheet.GetRange(rangeRef).SetValue(table);
            Api.Save();
          } catch (err) {
            console.error("Error writing spreadsheet", err);
          }
        });
      } catch (e) {
        console.error("Error building editor command", e);
      }
    `
  );
}

async function fillSpreadsheetViaSdk({ docspaceBaseUrl, fileId, shareToken, rows }) {
  if (!shareToken) throw new Error("shareToken is missing");
  destroyEditor();
  await loadDocSpaceSdk(docspaceBaseUrl);

  const instance = window.DocSpace.SDK.initEditor({
    src: docspaceBaseUrl,
    id: String(fileId),
    frameId: editorFrameId,
    requestToken: shareToken,
    width: "1px",
    height: "1px",
    events: {
      onAppReady: () => {
        const frame = window.DocSpace?.SDK?.frames?.[editorFrameId];
        if (!frame) {
          logLine("[sdk] frame not found");
          destroyEditor();
          return;
        }
        frame.executeInEditor(buildEditorCommand(rows));
        setTimeout(() => destroyEditor(), 8000);
      },
      onAppError: (err) => {
        logLine("[sdk] editor error", err?.message || err);
        setTimeout(() => destroyEditor(), 1500);
      }
    }
  });

  editorInstance = instance;
}

async function ensureSdkLoadedFromContext() {
  const ctx = await getDocSpaceContext();
  const baseUrl = ctx?.portalUrl || ctx?.context?.portalUrl || window.location.origin;
  await loadDocSpaceSdk(baseUrl);
  return { ctx, baseUrl };
}

async function handleLoadTables() {
  const backendUrl = getBackendUrl();
  const db = getDbConfig();
  const result = await apiPost(backendUrl, "/api/db/tables", { db });
  const select = document.getElementById("tablesSelect");
  select.innerHTML = '<option value="">(tables)</option>';
  for (const t of result.tables || []) {
    const opt = document.createElement("option");
    opt.value = t.ref;
    opt.textContent = t.ref;
    select.appendChild(opt);
  }
  logLine("[db] tables", { count: result.tables?.length || 0 });
}

async function handleExportViaSdk() {
  const backendUrl = getBackendUrl();
  const db = getDbConfig();
  const table = getSelectedTable();
  if (!table) throw new Error("Select a table first");

  const { ctx, baseUrl } = await ensureSdkLoadedFromContext();
  const roomId = resolveRoomId(ctx);
  const token = ctx?.token || ctx?.context?.token || "";
  if (!roomId || !token) {
    throw new Error("Plugin context has no roomId/token; open inside a room");
  }

  const rowsResult = await apiPost(backendUrl, "/api/db/rows", { db, table, limit: getLimit() });
  const rows = rowsResult.rows || [];
  logLine("[db] rows fetched", { table, rows: rows.length });

  const fileName = makeFileName(table);
  const createResult = await apiPost(backendUrl, "/api/docspace/create-xlsx", {
    docspace: { baseUrl, token, roomId, folderTitle: "Reports" },
    fileName
  });

  const fileId = createResult?.file?.id;
  const shareToken = createResult?.file?.shareToken;
  logLine("[docspace] xlsx created", { fileId, fileName, shareToken: shareToken ? "[set]" : "" });

  await fillSpreadsheetViaSdk({ docspaceBaseUrl: baseUrl, fileId, shareToken, rows });
  logLine("[export] sdk fill started", { fileId, fileName });
}

async function initPlugin() {
  const pingBtn = document.getElementById("pingBackend");
  const loadBtn = document.getElementById("loadTables");
  const exportBtn = document.getElementById("exportSdk");

  pingBtn.addEventListener("click", async () => {
    try {
      const data = await apiGet(getBackendUrl(), "/api/health");
      logLine("[backend] health", data);
    } catch (e) {
      logLine("[backend] health failed", e?.message || e);
    }
  });

  loadBtn.addEventListener("click", async () => {
    try {
      await handleLoadTables();
    } catch (e) {
      logLine("[db] load tables failed", e?.message || e);
    }
  });

  exportBtn.addEventListener("click", async () => {
    try {
      await handleExportViaSdk();
    } catch (e) {
      logLine("[export] failed", e?.message || e);
    }
  });

  try {
    const { baseUrl } = await ensureSdkLoadedFromContext();
    logLine("[sdk] ready", { baseUrl });
  } catch (e) {
    logLine("[sdk] init failed", e?.message || e);
  }
}

initPlugin();

