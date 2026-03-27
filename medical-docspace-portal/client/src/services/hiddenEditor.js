let sdkLoaderPromise = null;

export function loadDocSpaceSdk(src) {
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
    script.src = `${src}/static/scripts/sdk/2.0.0/api.js`;
    script.async = true;
    script.onload = () => resolve(window.DocSpace?.SDK);
    script.onerror = () => reject(new Error("Failed to load DocSpace SDK"));
    document.head.appendChild(script);
  });
  return sdkLoaderPromise;
}

export function ensureHiddenEditorFrame(frameId, { title = "Hidden editor", appendToBody = false } = {}) {
  const id = String(frameId || "").trim();
  if (!id) return null;
  let host = document.getElementById(id);
  if (host) return host;

  if (!appendToBody) return null;

  host = document.createElement("iframe");
  host.id = id;
  host.className = "hidden-editor";
  host.setAttribute("title", title);
  document.body.appendChild(host);
  return host;
}

export function destroyHiddenEditor(instanceRef) {
  const instance = instanceRef?.current || null;
  if (instance?.destroyFrame) {
    instance.destroyFrame();
  } else if (instance?.destroy) {
    instance.destroy();
  }
  if (instanceRef) {
    instanceRef.current = null;
  }
}

export async function initHiddenEditor({
  docspaceUrl,
  fileId,
  frameId,
  requestToken,
  mode = "edit",
  width = "1px",
  height = "1px",
  events
} = {}) {
  await loadDocSpaceSdk(docspaceUrl);
  return window.DocSpace?.SDK?.initEditor({
    src: docspaceUrl,
    id: String(fileId),
    frameId,
    requestToken,
    mode,
    width,
    height,
    events
  });
}

