import { useEffect, useRef } from "react";

export default function DocSpaceModal({ open, onClose, title = "Document", url }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!iframeRef.current) return;
    if (!open || !url) {
      iframeRef.current.src = "about:blank";
      return;
    }
    iframeRef.current.src = url;
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
            {url ? (
              <a className="btn subtle" href={url} target="_blank" rel="noreferrer">
                Open in new tab
              </a>
            ) : null}
            <button className="editor-close" type="button" onClick={onClose} aria-label="Close">
              Close
            </button>
          </div>
        </div>
        <div className="editor-frame">
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
