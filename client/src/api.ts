/**
 * Backend API mijozi.
 * - Barcha so'rovlar cookie bilan (credentials: include)
 * - 401 UNAUTHENTICATED da bir marta /api/auth/refresh urinib, so'rov takrorlanadi
 * - Refresh ham yiqilsa 'auth:logout' hodisasi tarqatiladi (AuthContext tinglaydi)
 */

// ─── Hisobot tiplari ───

export interface Line {
  code: string;
  name: string;
  amount: number;
}

export interface PnlReport {
  month: string;
  revenue: Line[];
  expenses: Line[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

export type CfCategory = 'operating' | 'investing' | 'financing';

export interface CashFlowReport {
  month: string;
  opening: number;
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
  closing: number;
  detail: { category: CfCategory; code: string; name: string; amount: number }[];
}

export interface BalanceSheet {
  asOf: string;
  assets: Line[];
  liabilities: Line[];
  equity: Line[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  imbalance: number;
}

export interface BridgeLine {
  code: string;
  label: string;
  amount: number;
}

/** "Nega foyda ≠ pul?" — 2.3-bo'lim ko'prigi, backend'da jonli hisoblanadi */
export interface ProfitCashBridge {
  month: string;
  netProfit: number;
  lines: BridgeLine[];
  total: number;
  cashChange: number;
  matches: boolean;
}

export interface MonthlyReports {
  month: string;
  pnl: PnlReport | null;
  cashflow: CashFlowReport | null;
  balance: BalanceSheet;
  bridge: ProfitCashBridge | null;
}

export interface ReconcileResult {
  months: number;
  ok: boolean;
  equations: { name: string; checked: number; mismatched: number; totalAbsDiff: number }[];
}

// ─── Auth tiplari ───

export interface User {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  permissions: string[];
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  system: boolean;
  users: number;
  updatedAt: string;
}

export interface PermissionDef {
  key: string;
  label: string;
}

export interface AuditLog {
  id: string;
  ts: string;
  action: string;
  ok: boolean;
  actorEmail: string | null;
  target: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
}

// ─── So'rov yadrosi ───

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function rawRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
}

let refreshing: Promise<boolean> | null = null;

/** Refresh — parallel so'rovlar bitta refresh bilan bo'lishadi */
async function tryRefresh(): Promise<boolean> {
  refreshing ??= rawRequest('/api/auth/refresh', { method: 'POST' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => {
        refreshing = null;
      }, 0);
    });
  return refreshing;
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const res = await rawRequest(path, init);
  if (res.ok) return (await res.json()) as T;

  let body: { error?: string; code?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* json bo'lmagan javob */
  }

  if (res.status === 401 && !retried && !path.startsWith('/api/auth/')) {
    if (await tryRefresh()) return request<T>(path, init, true);
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }
  throw new ApiError(res.status, body.error ?? `Server xatosi (${res.status})`, body.code);
}

const get = <T,>(path: string) => request<T>(path);
const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = <T,>(path: string) => request<T>(path, { method: 'DELETE' });

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
};

// ─── Endpointlar ───

export const api = {
  // Hisobotlar
  months: () => get<{ months: string[] }>('/api/months'),
  monthly: (month: string) => get<MonthlyReports>(`/api/reports/monthly${qs({ month })}`),
  pnlAll: () => get<{ reports: PnlReport[] }>('/api/reports/pnl'),
  reconcile: () => get<ReconcileResult>('/api/reconcile'),

  // Auth
  me: () => get<{ user: User }>('/api/auth/me'),
  login: (email: string, password: string) =>
    post<{ user: User }>('/api/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    post<{ user: User }>('/api/auth/register', { name, email, password }),
  logout: () => post<{ ok: true }>('/api/auth/logout'),
  forgot: (email: string) =>
    post<{ ok: true; message: string; devToken?: string }>('/api/auth/forgot', { email }),
  reset: (token: string, password: string) =>
    post<{ ok: true; message: string }>('/api/auth/reset', { token, password }),
  updateProfile: (name: string) => patch<{ user: User }>('/api/auth/profile', { name }),
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ ok: true; message: string }>('/api/auth/change-password', {
      currentPassword,
      newPassword,
    }),

  // Admin: foydalanuvchilar
  users: (p: { page?: number; limit?: number; search?: string; role?: string }) =>
    get<Paginated<AdminUser>>(`/api/users${qs(p)}`),
  createUser: (b: { name: string; email: string; password: string; roleKey: string; active: boolean }) =>
    post<{ user: AdminUser }>('/api/users', b),
  updateUser: (id: string, b: Partial<{ name: string; roleKey: string; active: boolean; password: string }>) =>
    patch<{ user: AdminUser }>(`/api/users/${id}`, b),
  deleteUser: (id: string) => del<{ ok: true }>(`/api/users/${id}`),

  // Admin: rollar
  roles: (p: { page?: number; limit?: number } = {}) =>
    get<Paginated<Role>>(`/api/roles${qs({ limit: 100, ...p })}`),
  permissions: () => get<{ permissions: PermissionDef[] }>('/api/roles/permissions'),
  createRole: (b: { key: string; name: string; description: string; permissions: string[] }) =>
    post<{ ok: true }>('/api/roles', b),
  updateRole: (key: string, b: Partial<{ name: string; description: string; permissions: string[] }>) =>
    patch<{ ok: true }>(`/api/roles/${key}`, b),
  deleteRole: (key: string) => del<{ ok: true }>(`/api/roles/${key}`),

  // Admin: audit loglar
  logs: (p: { page?: number; limit?: number; action?: string; email?: string; ok?: 'true' | 'false' }) =>
    get<Paginated<AuditLog>>(`/api/logs${qs(p)}`),
};
