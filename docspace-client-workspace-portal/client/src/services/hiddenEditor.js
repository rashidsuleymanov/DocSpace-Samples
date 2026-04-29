let sdkLoaderPromise = null;

export function loadDocSpaceSdk(src) {
  if (sdkLoaderPromise) return sdkLoaderPromise;
  const cleanSrc = String(src || "").replace(/\/+$/, "");
  sdkLoaderPromise = new Promise((resolve, reject) => {
    if (window.DocSpace?.SDK) {
      resolve(window.DocSpace.SDK);
      return;
    }
    if (!cleanSrc) {
      reject(new Error("DocSpace URL is missing"));
      return;
    }
    const script = document.createElement("script");
    script.src = `${cleanSrc}/static/scripts/sdk/2.0.0/api.js`;
    script.async = true;
    script.onload = () => resolve(window.DocSpace?.SDK);
    script.onerror = () => reject(new Error("Failed to load DocSpace SDK"));
    document.head.appendChild(script);
  });
  return sdkLoaderPromise;
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
