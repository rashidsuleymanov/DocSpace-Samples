export function renderEmbedScript({ baseUrl }) {
  const origin = String(baseUrl || "").replace(/\/+$/, "");
  return `(() => {
  const script = document.currentScript;
  const publicId = script?.dataset?.agentId || script?.dataset?.docspaceAgent || "";
  const embedKey = script?.dataset?.agentKey || script?.dataset?.docspaceKey || "";
  if (!publicId || !embedKey) return;

  let theme = { launcherText: "Chat", position: "right", primaryColor: "#0f172a" };
  try {
    fetch("${origin}/api/widget/" + encodeURIComponent(publicId) + "/config", {
      headers: { "x-embed-key": embedKey }
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        const t = cfg?.agent?.theme || {};
        theme = {
          launcherText: typeof t.launcherText === "string" && t.launcherText ? t.launcherText : "Chat",
          position: t.position === "left" ? "left" : "right",
          primaryColor: typeof t.primaryColor === "string" && t.primaryColor ? t.primaryColor : "#0f172a"
        };
        applyTheme();
      })
      .catch(() => null);
  } catch {
    // ignore
  }

  const root = document.createElement("div");
  root.id = "agent-widget-root";
  root.style.position = "fixed";
  root.style.bottom = "18px";
  root.style.zIndex = "2147483000";
  root.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  document.body.appendChild(root);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = theme.launcherText || "Chat";
  btn.style.padding = "12px 14px";
  btn.style.borderRadius = "999px";
  btn.style.border = "1px solid rgba(15,23,42,0.18)";
  btn.style.background = theme.primaryColor || "#0f172a";
  btn.style.color = "#fff";
  btn.style.fontWeight = "700";
  btn.style.cursor = "pointer";
  btn.style.boxShadow = "0 18px 40px rgba(15,23,42,0.18)";

  const panel = document.createElement("div");
  panel.style.position = "fixed";
  panel.style.bottom = "74px";
  panel.style.width = "min(420px, calc(100vw - 36px))";
  panel.style.height = "min(640px, calc(100vh - 120px))";
  panel.style.borderRadius = "18px";
  panel.style.overflow = "hidden";
  panel.style.border = "1px solid rgba(15,23,42,0.14)";
  panel.style.background = "#fff";
  panel.style.boxShadow = "0 30px 80px rgba(15,23,42,0.22)";
  panel.style.display = "none";

  const iframe = document.createElement("iframe");
  iframe.title = "Chat Agent";
  iframe.src = "${origin}/w/" + encodeURIComponent(publicId) + "?k=" + encodeURIComponent(embedKey);
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";
  iframe.referrerPolicy = "no-referrer";

  panel.appendChild(iframe);
  root.appendChild(panel);
  root.appendChild(btn);

  function applyTheme() {
    const isLeft = theme.position === "left";
    root.style.left = isLeft ? "18px" : "";
    root.style.right = isLeft ? "" : "18px";
    panel.style.left = isLeft ? "18px" : "";
    panel.style.right = isLeft ? "" : "18px";
    btn.textContent = theme.launcherText || "Chat";
    btn.style.background = theme.primaryColor || "#0f172a";
  }

  applyTheme();

  function toggle() {
    const open = panel.style.display !== "none";
    panel.style.display = open ? "none" : "block";
    btn.textContent = open ? (theme.launcherText || "Chat") : "Close";
  }

  btn.addEventListener("click", toggle);
})();`;
}
