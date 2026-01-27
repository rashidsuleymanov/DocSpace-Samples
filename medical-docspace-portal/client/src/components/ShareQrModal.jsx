export default function ShareQrModal({ open, title, link, loading, error, onClose }) {
  if (!open) return null;
  const encoded = link ? encodeURIComponent(link) : "";
  const qrSrc = link
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encoded}`
    : "";

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card share-modal">
        <div className="panel-head modal-head">
          <h3>{title || "Share"}</h3>
          <button className="ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {loading && <p className="muted">Creating share link...</p>}
        {error && !loading && <p className="muted">Error: {formatError(error)}</p>}

        {!loading && !error && link && (
          <div className="share-modal-body qr-only">
            <img className="share-qr" src={qrSrc} alt="QR code" />
          </div>
        )}
      </div>
    </div>
  );
}

function formatError(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
