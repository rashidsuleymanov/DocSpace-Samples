import { clearSettings, loadSettings, saveSettings } from "./storage.js";
import { apiPost } from "./api.js";

const editorFrameId = "docspace-sdk-hidden-editor";

let sdkLoaderPromise = null;
let editorInstance = null;

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

function loadDocSpaceSdk(src) {
  if (sdkLoaderPromise) return sdkLoaderPromise;
  sdkLoaderPromise = new Promise((resolve, reject) => {
    if (window.DocSpace?.SDK) {
      resolve(window.DocSpace.SDK);
      return;
    }
    if (!src) {
      reject(new Error("DocSpace URL is missing"));
      return;
    }
    const script = document.createElement("script");
    script.src = `${src.replace(/\/$/, "")}/static/scripts/sdk/2.0.0/api.js`;
    script.async = true;
    script.onload = () => resolve(window.DocSpace?.SDK);
    script.onerror = () => reject(new Error("Failed to load DocSpace SDK"));
    document.head.appendChild(script);
  });
  return sdkLoaderPromise;
}

function destroyEditor() {
  if (editorInstance?.destroy) {
    editorInstance.destroy();
  }
  editorInstance = null;
}

const els = {
  baseUrl: document.getElementById("baseUrl"),
  authToken: document.getElementById("authToken"),
  roomId: document.getElementById("roomId"),
  folderTitle: document.getElementById("folderTitle"),
  uploadTpl: document.getElementById("uploadTpl"),

  dataUrlTemplate: document.getElementById("dataUrlTemplate"),
  tablesCsv: document.getElementById("tablesCsv"),
  tablesSelect: document.getElementById("tablesSelect"),
  rowLimit: document.getElementById("rowLimit"),

  save: document.getElementById("save"),
  load: document.getElementById("load"),
  clear: document.getElementById("clear"),
  testAuth: document.getElementById("testAuth"),
  exportTable: document.getElementById("exportTable"),

  log: document.getElementById("log")
};

function settingsFromUi() {
  return {
    docspace: {
      baseUrl: els.baseUrl.value.trim(),
      token: els.authToken.value.trim(),
      roomId: els.roomId.value.trim(),
      folderTitle: els.folderTitle.value.trim(),
      uploadTemplate: els.uploadTpl.value.trim()
    },
    http: {
      dataUrlTemplate: els.dataUrlTemplate.value.trim(),
      tablesCsv: els.tablesCsv.value.trim()
    },
    export: {
      limit: els.rowLimit.value.trim()
    }
  };
}

function applySettingsToUi(value) {
  const v = value || {};
  const d = v.docspace || {};
  const h = v.http || {};
  const ex = v.export || {};

  if (d.baseUrl !== undefined) els.baseUrl.value = d.baseUrl;
  if (d.token !== undefined) els.authToken.value = d.token;
  if (d.roomId !== undefined) els.roomId.value = d.roomId;
  if (d.folderTitle !== undefined) els.folderTitle.value = d.folderTitle;
  if (d.uploadTemplate !== undefined) els.uploadTpl.value = d.uploadTemplate;

  if (h.dataUrlTemplate !== undefined) els.dataUrlTemplate.value = h.dataUrlTemplate;
  if (h.tablesCsv !== undefined) els.tablesCsv.value = h.tablesCsv;

  if (ex.limit !== undefined) els.rowLimit.value = ex.limit;
}

function logLine(label, data) {
  const ts = new Date().toISOString();
  const line = data === undefined ? `${ts} ${label}` : `${ts} ${label}\n${safeStringify(data)}\n`;
  els.log.textContent = `${line}\n${els.log.textContent}`;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function withBusy(button, fn) {
  const prev = button.textContent;
  button.disabled = true;
  button.textContent = "...";
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.textContent = prev;
  }
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
        if (typeof editorInstance?.createConnector !== "function") {
          console.error("createConnector is not available", editorInstance);
          return;
        }
        const connector = editorInstance.createConnector();
        if (typeof connector?.callCommand !== "function") {
          console.error("connector.callCommand is not available", connector);
          return;
        }
        Asc.scope.rows = rows;
        connector.callCommand(function () {
          try {
            const data = Asc.scope.rows || [];
            const sheet = Api.GetActiveSheet();
            if (!sheet) {
              console.error("Active sheet is not available");
              return;
            }
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
            const range = sheet.GetRange(rangeRef);
            range.SetValue(table);
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

async function fillSpreadsheetViaSdk({ docspace, fileId, shareToken, rows }) {
  if (!shareToken) throw new Error("shareToken is missing (cannot open editor)");

  destroyEditor();
  await loadDocSpaceSdk(docspace.baseUrl);

  const instance = window.DocSpace?.SDK?.initEditor({
    src: docspace.baseUrl,
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
        const command = buildEditorCommand(rows);
        frame.executeInEditor(command);
        setTimeout(() => destroyEditor(), 8000);
      },
      onAppError: (error) => {
        logLine("[sdk] editor error", error?.message || error);
        setTimeout(() => destroyEditor(), 1500);
      }
    }
  });

  editorInstance = instance;
}

function resolveDocSpaceFromContext(ctx) {
  const baseUrl = ctx?.portalUrl || ctx?.context?.portalUrl || window.location.origin;
  const token = ctx?.token || ctx?.context?.token || "";
  const roomId = ctx?.room?.id || ctx?.context?.roomId || ctx?.context?.id || "";
  return { baseUrl, token, roomId };
}

async function ensureSdkLoadedFromContext() {
  const sdk = window.DocSpace?.SDK;
  if (!sdk?.getContext) throw new Error("DocSpace SDK context is not available");
  const ctx = await sdk.getContext();
  const resolved = resolveDocSpaceFromContext(ctx || {});
  await loadDocSpaceSdk(resolved.baseUrl);
  return resolved;
}

async function fetchRowsFromHttp({ dataUrlTemplate, table, limit }) {
  const url = String(dataUrlTemplate || "").replace("{table}", encodeURIComponent(String(table || "")));
  if (!url) throw new Error("dataUrlTemplate is empty");
  const response = await fetch(url);
  const data = await response.json();
  const rows = Array.isArray(data) ? data : data?.rows || data?.data || [];
  if (!Array.isArray(rows)) {
    throw new Error("HTTP data response must be an array or {rows: []}");
  }
  return limit ? rows.slice(0, Number(limit)) : rows;
}

function hydrateTablesSelect(csv) {
  const items = String(csv || "").split(",").map((s) => s.trim()).filter(Boolean);
  els.tablesSelect.innerHTML = '<option value="">(tables)</option>';
  for (const t of items) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    els.tablesSelect.appendChild(opt);
  }
}

els.save.addEventListener("click", () => {
  const s = settingsFromUi();
  saveSettings(s);
  logLine("[settings] saved", {
    docspace: { ...s.docspace, token: s.docspace.token ? "[set]" : "" },
    http: s.http,
    export: s.export
  });
});

els.load.addEventListener("click", () => {
  const s = loadSettings();
  applySettingsToUi(s || {});
  hydrateTablesSelect(els.tablesCsv.value);
  logLine("[settings] loaded", s ? { ok: true } : { ok: false });
});

els.clear.addEventListener("click", () => {
  clearSettings();
  applySettingsToUi({ docspace: { token: "" }, http: { dataUrlTemplate: "", tablesCsv: "" } });
  hydrateTablesSelect("");
  logLine("[settings] cleared");
});

els.testAuth.addEventListener("click", () =>
  withBusy(els.testAuth, async () => {
    const s = settingsFromUi();
    const result = await apiPost("/api/docspace/self", { baseUrl: s.docspace.baseUrl, token: s.docspace.token });
    const self = result?.self;
    logLine("[docspace] self", {
      id: self?.id,
      displayName: self?.displayName,
      email: self?.email,
      isAdmin: self?.isAdmin
    });
  })
);

els.tablesCsv.addEventListener("change", () => {
  hydrateTablesSelect(els.tablesCsv.value);
});

els.exportTable.addEventListener("click", () =>
  withBusy(els.exportTable, async () => {
    const s = settingsFromUi();
    const table = els.tablesSelect.value;
    if (!table) throw new Error("Select a table first");

    const docspace = await ensureSdkLoadedFromContext();
    if (!docspace.baseUrl || !docspace.token || !docspace.roomId) {
      throw new Error("Missing DocSpace context (roomId/token)");
    }

    const rows = await fetchRowsFromHttp({
      dataUrlTemplate: s.http.dataUrlTemplate,
      table,
      limit: s.export.limit
    });
    logLine("[http] rows", { table, rows: rows.length });

    const fileName = makeFileName(table);
    const createResult = await apiPost("/api/docspace/create-xlsx", {
      docspace: {
        baseUrl: docspace.baseUrl,
        token: docspace.token,
        roomId: docspace.roomId,
        folderTitle: s.docspace.folderTitle || "Reports"
      },
      fileName
    });

    const fileId = createResult?.file?.id;
    const shareToken = createResult?.file?.shareToken;
    logLine("[docspace] xlsx created", { fileId, fileName, shareToken: shareToken ? "[set]" : "" });

    await fillSpreadsheetViaSdk({ docspace: docspace, fileId, shareToken, rows });
    logLine("[export] sdk fill started", { fileId, fileName });
  })
);

(function initFromQuery() {
  const dataUrlTemplate = getQueryParam("dataUrlTemplate");
  const tables = getQueryParam("tables");
  const backendUrl = getQueryParam("backendUrl");

  if (backendUrl) {
    // api.js will use backendUrl automatically
  }

  if (dataUrlTemplate) {
    els.dataUrlTemplate.value = dataUrlTemplate;
  }

  if (tables) {
    els.tablesCsv.value = tables;
  }

  hydrateTablesSelect(els.tablesCsv.value);
})();
