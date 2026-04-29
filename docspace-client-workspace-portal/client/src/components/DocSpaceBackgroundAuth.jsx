import { useEffect, useRef } from "react";
import { loadDocSpaceSdk } from "../services/hiddenEditor.js";

const docspaceUrl = (import.meta.env.VITE_DOCSPACE_URL || "").replace(/\/+$/, "");

export default function DocSpaceBackgroundAuth({ sessionUserId, credentialsUrl }) {
  const doneRef = useRef(false);

  useEffect(() => {
    if (!sessionUserId || !credentialsUrl || !docspaceUrl) return;
    if (doneRef.current) return;

    let cancelled = false;
    const frameId = `docspace-bg-auth-${credentialsUrl.replace(/\W/g, "")}`;
    const container = document.createElement("div");
    container.id = frameId;
    container.style.cssText =
      "position:fixed;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;z-index:-1";
    document.body.appendChild(container);

    const destroyFrame = () => {
      try {
        window.DocSpace?.SDK?.frames?.[frameId]?.destroyFrame?.();
      } catch {
        // ignore cleanup failures
      }
      container.remove();
    };

    const run = async () => {
      try {
        await loadDocSpaceSdk(docspaceUrl);
        if (cancelled) return;

        const response = await fetch(credentialsUrl, { credentials: "include" });
        if (!response.ok || cancelled) return;
        const creds = await response.json().catch(() => null);
        if (!creds?.email || !creds?.password || cancelled) return;

        const instance = window.DocSpace.SDK.initSystem({
          src: docspaceUrl,
          frameId,
          width: "1px",
          height: "1px",
          events: {
            onAppReady: async () => {
              try {
                const settings = await instance.getHashSettings();
                const hash = await instance.createHash(creds.password, settings);
                await instance.login(creds.email, hash);
              } catch {
                if (!cancelled) destroyFrame();
              }
            },
            onAuthSuccess: () => {
              doneRef.current = true;
              if (!cancelled) destroyFrame();
            },
            onSignIn: () => {
              doneRef.current = true;
              if (!cancelled) destroyFrame();
            },
            onAppError: () => {
              if (!cancelled) destroyFrame();
            }
          }
        });

        setTimeout(() => {
          if (!cancelled && !doneRef.current) {
            destroyFrame();
          }
        }, 15000);
      } catch {
        if (!cancelled) destroyFrame();
      }
    };

    run();

    return () => {
      cancelled = true;
      destroyFrame();
    };
  }, [sessionUserId, credentialsUrl]);

  return null;
}
