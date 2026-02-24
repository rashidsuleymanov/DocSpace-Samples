const TOAST_EVENT = "medical.portal.toast";

function emitToast(message, { variant = "info", durationMs = 4500 } = {}) {
  if (!message) return;
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, {
      detail: {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        message: String(message),
        variant,
        durationMs
      }
    })
  );
}

export const toast = Object.assign(emitToast, {
  info(message, options) {
    emitToast(message, { ...options, variant: "info" });
  },
  success(message, options) {
    emitToast(message, { ...options, variant: "success" });
  },
  error(message, options) {
    emitToast(message, { ...options, variant: "error" });
  }
});

export { TOAST_EVENT };

