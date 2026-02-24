import { useEffect, useRef, useState } from "react";

export default function DocSpaceModal({ open, onClose, title = "Document", url }) {
  const iframeRef = useRef(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!iframeRef.current) return;
    if (!open || !url) {
      iframeRef.current.src = "about:blank";
      return;
    }

    const node = iframeRef.current;
    node.src = "about:blank";
    const timer = window.setTimeout(() => {
      if (!iframeRef.current) return;
      iframeRef.current.src = url;
    }, 40);

    return () => window.clearTimeout(timer);
  }, [open, url, reloadNonce]);

  useEffect(() => {
    if (!open) {
      setHelpOpen(false);
      return;
    }
    setHelpOpen(false);
  }, [open, url]);

  return (
    <div
      className={`editor-modal${open ? "" : " is-hidden"}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
    >
      <div className="editor-shell">
        <div className="editor-header">
          <strong className="editor-title">{title}</strong>
          <div className="editor-actions">
            <button
              className="editor-close"
              type="button"
              onClick={() => setHelpOpen((prev) => !prev)}
              disabled={!url}
              aria-expanded={helpOpen}
            >
              Help
            </button>
            <button
              className="editor-close"
              type="button"
              onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
              disabled={!url}
            >
              Open in new tab
            </button>
            <button className="editor-close" type="button" onClick={() => setReloadNonce((n) => n + 1)}>
              Reload
            </button>
            <button className="editor-close" type="button" onClick={onClose} aria-label="Close">
              Close
            </button>
          </div>
        </div>
        <div className="editor-frame">
          {helpOpen && (
            <div className="editor-help" role="note">
              <strong>Can’t open the document?</strong>
              <p className="muted">
                Some workspaces require a separate sign-in. Open the document in a new tab, sign in there,
                then come back and click Reload.
              </p>
            </div>
          )}
          <iframe
            ref={iframeRef}
            title={title}
            className="docspace-embed"
            src="about:blank"
            frameBorder="0"
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        </div>
      </div>
    </div>
  );
}
