import { useEffect, useRef, useState } from "react";
import { destroyHiddenEditor, loadDocSpaceSdk } from "../services/hiddenEditor.js";

const docspaceUrl = (import.meta.env.VITE_DOCSPACE_URL || "").replace(/\/+$/, "");
const SDK_FRAME_ID = "client-workspace-docspace-modal-frame";

export default function DocSpaceModal({
  open,
  onClose,
  title = "Document",
  url,
  fileId,
  token,
  credentialsUrl = "/api/demo/credentials"
}) {
  const iframeRef = useRef(null);
  const sdkInstanceRef = useRef(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [phase, setPhase] = useState("init");

  const useSdk = Boolean(fileId && docspaceUrl);

  useEffect(() => {
    if (!open) {
      destroyHiddenEditor(sdkInstanceRef);
      setPhase("init");
      return;
    }
    if (!useSdk) return;

    let cancelled = false;
    destroyHiddenEditor(sdkInstanceRef);

    const run = async () => {
      await loadDocSpaceSdk(docspaceUrl);
      if (cancelled) return;

      let creds = null;
      try {
        const response = await fetch(credentialsUrl, { credentials: "include" });
        if (response.ok) {
          creds = await response.json();
        }
      } catch {
        creds = null;
      }

      if (creds?.email && creds?.password) {
        setPhase("authing");
        let opened = false;
        const openEditor = () => {
          if (opened || cancelled) return;
          opened = true;
          setPhase("opening");
          const frame = document.getElementById(SDK_FRAME_ID);
          const iframe = frame?.tagName?.toLowerCase() === "iframe" ? frame : frame?.querySelector("iframe");
          if (iframe) {
            iframe.src = `${docspaceUrl}/doceditor?fileid=${encodeURIComponent(String(fileId))}`;
            iframe.onload = () => {
              if (!cancelled) {
                setPhase("ready");
              }
            };
            return;
          }

          const instance = window.DocSpace?.SDK?.initEditor({
            src: docspaceUrl,
            id: String(fileId),
            frameId: SDK_FRAME_ID,
            width: "100%",
            height: "100%"
          });
          sdkInstanceRef.current = instance;
          setPhase("ready");
        };

        const systemInstance = window.DocSpace.SDK.initSystem({
          src: docspaceUrl,
          frameId: SDK_FRAME_ID,
          width: "100%",
          height: "100%",
          events: {
            onAppReady: async () => {
              try {
                const settings = await systemInstance.getHashSettings();
                const hash = await systemInstance.createHash(creds.password, settings);
                await systemInstance.login(creds.email, hash);
                setTimeout(() => {
                  if (!opened && !cancelled) {
                    openEditor();
                  }
                }, 4000);
              } catch {
                fallbackToToken();
              }
            },
            onAuthSuccess: openEditor,
            onSignIn: openEditor,
            onAppError: fallbackToToken
          }
        });
        sdkInstanceRef.current = systemInstance;
        return;
      }

      fallbackToToken();

      function fallbackToToken() {
        if (cancelled) return;
        if (!token) {
          setPhase("error");
          return;
        }
        setPhase("fallback");
        destroyHiddenEditor(sdkInstanceRef);
        const instance = window.DocSpace?.SDK?.initEditor({
          src: docspaceUrl,
          id: String(fileId),
          frameId: SDK_FRAME_ID,
          requestToken: token,
          width: "100%",
          height: "100%"
        });
        sdkInstanceRef.current = instance;
      }
    };

    run().catch(() => {
      if (!cancelled) {
        setPhase("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, useSdk, fileId, token, credentialsUrl, reloadNonce]);

  useEffect(() => {
    if (useSdk) return;
    if (!iframeRef.current) return;
    if (!open || !url) {
      iframeRef.current.src = "about:blank";
      return;
    }
    iframeRef.current.src = url;
  }, [open, url, useSdk, reloadNonce]);

  useEffect(() => () => destroyHiddenEditor(sdkInstanceRef), []);

  if (!open) return null;

  const phaseLabel =
    phase === "authing"
      ? "Signing in..."
      : phase === "opening"
        ? "Opening editor..."
        : phase === "fallback"
          ? "View mode"
          : phase === "error"
            ? "Open in new tab"
            : "";

  const externalUrl =
    url ||
    (fileId && docspaceUrl ? `${docspaceUrl}/doceditor?fileid=${encodeURIComponent(String(fileId))}` : "");

  return (
    <div className="editor-modal" role="dialog" aria-modal="true">
      <div className="editor-shell">
        <div className="editor-header">
          <strong className="editor-title">{title}</strong>
          <div className="editor-actions">
            {phaseLabel ? <span className="editor-phase-label">{phaseLabel}</span> : null}
            <button className="editor-close" type="button" onClick={() => setReloadNonce((value) => value + 1)}>
              Reload
            </button>
            <button
              className="editor-close"
              type="button"
              onClick={() => externalUrl && window.open(externalUrl, "_blank", "noopener,noreferrer")}
              disabled={!externalUrl}
            >
              Open in new tab
            </button>
            <button className="editor-close" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="editor-frame">
          <div id={SDK_FRAME_ID} style={{ width: "100%", height: "100%", display: useSdk ? "block" : "none" }} />
          <iframe
            ref={iframeRef}
            title={title}
            className="docspace-embed"
            src="about:blank"
            allow="clipboard-read; clipboard-write; fullscreen"
            style={{ border: "none", display: useSdk ? "none" : "block" }}
          />
        </div>
      </div>
    </div>
  );
}
