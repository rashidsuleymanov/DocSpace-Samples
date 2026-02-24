import { useEffect, useMemo, useState } from "react";
import { TOAST_EVENT } from "../utils/toast.js";

export default function ToastHost() {
  const [toasts, setToasts] = useState([]);

  const removeToast = useMemo(
    () => (id) => setToasts((prev) => prev.filter((toast) => toast.id !== id)),
    []
  );

  useEffect(() => {
    const handleToast = (event) => {
      const next = event?.detail;
      if (!next?.id) return;
      setToasts((prev) => [...prev, next].slice(-4));

      const durationMs = Number(next.durationMs);
      if (Number.isFinite(durationMs) && durationMs > 0) {
        window.setTimeout(() => removeToast(next.id), durationMs);
      }
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, [removeToast]);

  if (!toasts.length) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.variant || "info"}`}>
          <div className="toast-message">{toast.message}</div>
          <button
            type="button"
            className="toast-close"
            onClick={() => removeToast(toast.id)}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

