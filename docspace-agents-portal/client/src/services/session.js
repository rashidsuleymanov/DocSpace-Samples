import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./http.js";

export function useSession() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [hasServiceToken, setHasServiceToken] = useState(false);

  const refresh = useCallback(async () => {
    const res = await api("/api/auth/session");
    setUser(res?.user || null);
    setHasServiceToken(Boolean(res?.hasServiceToken));
    return res;
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch(() => {
        setUser(null);
        setHasServiceToken(false);
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
  }, []);

  return useMemo(
    () => ({
      loading,
      user,
      isAuthed: Boolean(user?.id),
      hasServiceToken,
      refresh,
      logout
    }),
    [loading, user, hasServiceToken, refresh, logout]
  );
}

