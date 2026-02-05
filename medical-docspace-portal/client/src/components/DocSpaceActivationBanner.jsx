import { useMemo, useState } from "react";

const storageKey = "medical.portal.docspace.activation";

function buildActivationKey({ userId, roomId }) {
  return `${storageKey}.${userId || "anon"}.${roomId || "room"}`;
}

function readActivation({ userId, roomId }) {
  try {
    const raw = localStorage.getItem(buildActivationKey({ userId, roomId }));
    return raw === "1";
  } catch {
    return false;
  }
}

function writeActivation({ userId, roomId }, value) {
  try {
    localStorage.setItem(buildActivationKey({ userId, roomId }), value ? "1" : "0");
  } catch {}
}

export default function DocSpaceActivationBanner({ userId, roomId, roomUrl }) {
  const docspaceUrl = import.meta.env.VITE_DOCSPACE_URL || "";

  const activationUrl = useMemo(() => {
    if (roomUrl) return roomUrl;
    if (!docspaceUrl) return "";
    if (roomId) return `${docspaceUrl}/rooms/shared/${roomId}`;
    return docspaceUrl;
  }, [docspaceUrl, roomId, roomUrl]);

  const [ack, setAck] = useState(() => readActivation({ userId, roomId }));

  if (!docspaceUrl) return null;
  if (!activationUrl) return null;
  if (ack) return null;

  return (
    <div className="activation-overlay" role="dialog" aria-modal="true">
      <div className="activation-card">
        <h3>Activate DocSpace access</h3>
        <p className="muted">
          Required one-time step: open DocSpace in a new tab and sign in once. Then come back here.
        </p>
        <div className="banner-actions">
          <button
            className="primary"
            type="button"
            onClick={() => window.open(activationUrl, "_blank", "noopener,noreferrer")}
          >
            Open DocSpace
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              writeActivation({ userId, roomId }, true);
              setAck(true);
            }}
          >
            Continue
          </button>
        </div>
        <p className="muted">
          Tip: keep the DocSpace tab open while working with documents in this portal.
        </p>
      </div>
    </div>
  );
}
