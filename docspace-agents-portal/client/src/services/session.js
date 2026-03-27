import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./http.js";

export function useSession() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [hasServiceToken, setHasServiceToken] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [demoAgentId, setDemoAgentId] = useState(null);
  const [demoPublicId, setDemoPublicId] = useState(null);
  const [demoExpiresAt, setDemoExpiresAt] = useState(null);

  const applyResponse = useCallback((res) => {
    setUser(res?.user || null);
    setHasServiceToken(Boolean(res?.hasServiceToken));
    setIsDemo(Boolean(res?.isDemo));
    setDemoEnabled(Boolean(res?.demoEnabled));
    setDemoAgentId(res?.demoAgentId || null);
    setDemoPublicId(res?.demoPublicId || null);
    setDemoExpiresAt(res?.demoExpiresAt || null);
  }, []);

  const refresh = useCallback(async () => {
    const res = await api("/api/auth/session");
    applyResponse(res);
    return res;
  }, [applyResponse]);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch(() => {
        setUser(null);
        setHasServiceToken(false);
        setIsDemo(false);
        setDemoEnabled(false);
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    setIsDemo(false);
  }, []);

  const endDemo = useCallback(async () => {
    await api("/api/demo/end", { method: "POST" }).catch(() => null);
    setUser(null);
    setIsDemo(false);
    setDemoAgentId(null);
    setDemoPublicId(null);
    setDemoExpiresAt(null);
  }, []);

  return useMemo(
    () => ({
      loading,
      user,
      isAuthed: Boolean(user?.id),
      hasServiceToken,
      isDemo,
      demoEnabled,
      demoAgentId,
      demoPublicId,
      demoExpiresAt,
      refresh,
      logout,
      endDemo
    }),
    [loading, user, hasServiceToken, isDemo, demoEnabled, demoAgentId, demoPublicId, demoExpiresAt, refresh, logout, endDemo]
  );
}
