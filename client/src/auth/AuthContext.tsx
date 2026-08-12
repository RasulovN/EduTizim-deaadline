import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, type User } from '../api';

/**
 * Auth holati: dastlab /api/auth/me orqali sessiya tiklanadi (httpOnly
 * cookie'lar brauzerda), api qatlami 401 da avtomatik refresh qiladi.
 */

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
  can: (perm: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then(({ user }) => {
        if (alive) setUserState(user);
      })
      .catch(() => {
        /* sessiya yo'q — login sahifasi */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    const onLogout = () => setUserState(null);
    window.addEventListener('auth:logout', onLogout);
    return () => {
      alive = false;
      window.removeEventListener('auth:logout', onLogout);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await api.login(email, password);
    setUserState(user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { user } = await api.register(name, email, password);
    setUserState(user);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUserState(null);
  }, []);

  const can = useCallback((perm: string) => user?.permissions.includes(perm) ?? false, [user]);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, setUser: setUserState, can }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth faqat AuthProvider ichida ishlaydi');
  return ctx;
}

/** Xatoni foydalanuvchiga ko'rsatiladigan matnga aylantirish */
export function errText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return 'Server bilan bog\'lanib bo\'lmadi';
  return String(e);
}
