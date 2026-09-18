import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  authExport,
  authGoogle,
  authLogin,
  authLogout,
  authMe,
  authSignup,
  clearSessionOnUnauthorized,
} from "../api";
import { clearSessionToken, getSessionToken, setSessionToken } from "../lib/session";
import { migrateFavoritesToHearts } from "../lib/hearts";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getSessionToken()) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const me = await authMe();
      setUser(me);
      migrateFavoritesToHearts().catch(() => {});
      return me;
    } catch {
      clearSessionToken();
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearSessionOnUnauthorized(() => {
      clearSessionToken();
      setUser(null);
    });
    refresh();
  }, [refresh]);

  const applySession = useCallback(async (result) => {
    setSessionToken(result.session_token);
    setUser(result.user);
    migrateFavoritesToHearts().catch(() => {});
    return result.user;
  }, []);

  const signIn = useCallback(
    async ({ email, password }) => {
      const result = await authLogin({ email, password });
      return applySession(result);
    },
    [applySession]
  );

  const signUp = useCallback(
    async ({ email, password, name }) => {
      const result = await authSignup({ email, password, name });
      return applySession(result);
    },
    [applySession]
  );

  const signInWithGoogle = useCallback(
    async (idToken) => {
      const result = await authGoogle({ idToken });
      return applySession(result);
    },
    [applySession]
  );

  const signOut = useCallback(async () => {
    try {
      await authLogout();
    } catch {
      /* ignore */
    }
    clearSessionToken();
    setUser(null);
  }, []);

  const exportData = useCallback(async () => authExport(), []);

  const value = useMemo(
    () => ({
      user,
      loading,
      signedIn: Boolean(user),
      refresh,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      exportData,
    }),
    [user, loading, refresh, signIn, signUp, signInWithGoogle, signOut, exportData]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
