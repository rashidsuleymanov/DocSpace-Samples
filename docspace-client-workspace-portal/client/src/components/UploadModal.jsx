import { useEffect, useMemo, useRef, useState } from "react";

let sdkLoaderPromise = null;

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
    script.src = `${src}/static/scripts/sdk/2.0.0/api.js`;
    script.async = true;
    script.onload = () => resolve(window.DocSpace?.SDK);
    script.onerror = () => reject(new Error("Failed to load DocSpace SDK"));
    document.head.appendChild(script);
  });
  return sdkLoaderPromise;
}

export default function UploadModal({
  open,
  title,
  targetFolderId,
  sourceFolderId,
  token,
  allowLocal = true,
  allowDocspace = true,
  onClose,
  onUploadLocal,
  onUploadCopy
}) {
  const [tab, setTab] = useState("docspace");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectorLoading, setSelectorLoading] = useState(false);
  const [error, setError] = useState("");
  const selectorFrameId = useRef(
    `docspace-selector-${Math.random().toString(36).slice(2, 9)}`
  );
  const docspaceUrl = import.meta.env.VITE_DOCSPACE_URL || "";

  useEffect(() => {
    if (!open) return;
    if (allowDocspace) {
      setTab("docspace");
    } else {
      setTab("local");
    }
    setFile(null);
    setError("");
  }, [open, allowLocal, allowDocspace]);

  useEffect(() => {
    if (!open || !allowDocspace || tab !== "docspace") return;
    let cancelled = false;

    const initSelector = async () => {
      try {
        setSelectorLoading(true);
        setError("");
        await loadDocSpaceSdk(docspaceUrl);
        if (cancelled) return;
        const sdk = window.DocSpace?.SDK;
        if (!sdk?.initFileSelector) {
          setError("DocSpace File Selector is not available.");
          setSelectorLoading(false);
          return;
        }
        const config = {
          src: docspaceUrl,
          requestToken: token || undefined,
          frameId: selectorFrameId.current,
          width: "100%",
          height: "420px",
          events: {
            onAppReady: () => {
              if (!cancelled) setSelectorLoading(false);
            },
            onAppError: (sdkError) => {
              if (cancelled) return;
              setError(sdkError?.message || "File selector error");
              setSelectorLoading(false);
            },
            onSelectCallback: async (item) => {
              if (cancelled || !item?.id) return;
              setLoading(true);
              setError("");
              try {
                await onUploadCopy(item.id);
                onClose?.();
              } catch (uploadError) {
                setError(uploadError?.message || "Copy failed");
              } finally {
                setLoading(false);
              }
            }
          }
        };
        sdk.initFileSelector(config);
      } catch (sdkError) {
        if (cancelled) return;
        setError(sdkError?.message || "Failed to initialize DocSpace selector");
        setSelectorLoading(false);
      }
    };

    initSelector();

    return () => {
      cancelled = true;
      const frame = document.getElementById(selectorFrameId.current);
      if (frame) frame.innerHTML = "";
      setSelectorLoading(false);
    };
  }, [open, tab, allowDocspace, docspaceUrl, token, onUploadCopy, onClose]);

  if (!open) return null;

  const handleLocalSubmit = async (event) => {
    event.preventDefault();
    if (!file || !targetFolderId) return;
    setLoading(true);
    setError("");
    try {
      await onUploadLocal(file);
      onClose?.();
    } catch (uploadError) {
      setError(uploadError?.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card upload-modal">
        <div className="panel-head modal-head">
          <h3>{title || "Upload document"}</h3>
          <button className="ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {allowDocspace && allowLocal && (
          <div className="tab-row">
            <button
              className={`tab-pill ${tab === "docspace" ? "active" : ""}`}
              type="button"
              onClick={() => setTab("docspace")}
            >
              DocSpace files
            </button>
            <button
              className={`tab-pill ${tab === "local" ? "active" : ""}`}
              type="button"
              onClick={() => setTab("local")}
            >
              Local upload
            </button>
          </div>
        )}

        {allowDocspace && tab === "docspace" && (
          <div className="docspace-selector">
            {selectorLoading && <p className="muted">Loading DocSpace selector...</p>}
            <div id={selectorFrameId.current} className="docspace-selector-frame" />
          </div>
        )}

        {allowLocal && tab === "local" && (
          <form className="form-grid" onSubmit={handleLocalSubmit}>
            <label>
              Select file
              <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            <button className="primary" type="submit" disabled={!file || loading}>
              {loading ? "Uploading..." : "Upload"}
            </button>
          </form>
        )}

        {error && <p className="muted">Error: {error}</p>}
      </div>
    </div>
  );
}
