import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  getSavedEmail,
  getToken,
  setSavedEmail,
  setToken,
  type ApiAdmin,
} from "./api";
import { clearAppMode } from "./mode";

type AuthState = {
  admin: ApiAdmin | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<ApiAdmin | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.me();
        if (!cancelled) setAdmin(me);
      } catch {
        if (!cancelled) {
          setToken(null);
          setTokenState(null);
          setAdmin(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      admin,
      token,
      loading,
      login: async (email, password) => {
        const result = await api.login(email, password);
        setToken(result.token);
        setTokenState(result.token);
        setAdmin(result.admin);
        setSavedEmail(email);
      },
      logout: () => {
        setToken(null);
        setTokenState(null);
        setAdmin(null);
        clearAppMode();
      },
    }),
    [admin, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}

export { getSavedEmail };
