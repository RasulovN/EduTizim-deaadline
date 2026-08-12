import type { ObjectId } from 'mongodb';

/**
 * Auth sohasi tiplari: foydalanuvchi, rol, sessiya (refresh token),
 * parol tiklash tokeni va audit log.
 */

/** Tizimdagi barcha ruxsatlar katalogi — rol tahrirlagichda ko'rsatiladi */
export const PERMISSIONS = [
  { key: 'reports.view', label: "Moliyaviy hisobotlarni ko'rish" },
  { key: 'users.manage', label: 'Foydalanuvchilarni boshqarish (CRUD)' },
  { key: 'roles.manage', label: 'Rollarni boshqarish (CRUD)' },
  { key: 'logs.view', label: 'Audit loglarni kuzatish' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

export interface RoleDoc {
  _id?: ObjectId;
  /** Kalit: kichik lotin harflar, masalan 'owner', 'admin' */
  key: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
  /** Tizim rollari o'chirib bo'lmaydi (owner/admin/director/viewer) */
  system: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDoc {
  _id?: ObjectId;
  email: string;
  name: string;
  /** scrypt: salt:hash (hex) */
  passwordHash: string;
  roleKey: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

/** Refresh token sessiyasi — tokenning o'zi emas, sha256 xeshi saqlanadi */
export interface SessionDoc {
  _id?: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  ip?: string;
  userAgent?: string;
}

/** Parol tiklash tokeni — sha256 xesh, 30 daqiqa amal qiladi, bir martalik */
export interface ResetTokenDoc {
  _id?: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date;
}

export interface AuditLogDoc {
  _id?: ObjectId;
  ts: Date;
  /** masalan: 'auth.login', 'user.create', 'role.delete' */
  action: string;
  ok: boolean;
  actorId?: ObjectId;
  actorEmail?: string;
  /** ta'sir qilingan obyekt (user email, rol kaliti, ...) */
  target?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export const AUTH_COLLECTIONS = {
  USERS: 'users',
  ROLES: 'roles',
  SESSIONS: 'sessions',
  RESET_TOKENS: 'reset_tokens',
  AUDIT_LOGS: 'audit_logs',
} as const;

/** O'rnatilgan (tizim) rollar — birinchi ishga tushishda yaratiladi */
export const DEFAULT_ROLES: Omit<RoleDoc, '_id' | 'createdAt' | 'updatedAt'>[] = [
  {
    key: 'owner',
    name: 'Egasi',
    description: "To'liq huquq: barcha bo'limlar va sozlamalar",
    permissions: [...ALL_PERMISSION_KEYS],
    system: true,
  },
  {
    key: 'admin',
    name: 'Administrator',
    description: 'Foydalanuvchi va rollarni boshqaradi, loglarni kuzatadi',
    permissions: ['reports.view', 'users.manage', 'roles.manage', 'logs.view'],
    system: true,
  },
  {
    key: 'director',
    name: 'Direktor',
    description: "Moliyaviy hisobotlarni ko'radi",
    permissions: ['reports.view'],
    system: true,
  },
  {
    key: 'viewer',
    name: 'Kuzatuvchi',
    description: "Faqat hisobotlarni ko'rish (yangi ro'yxatdan o'tganlar uchun)",
    permissions: ['reports.view'],
    system: true,
  },
];

/** O'z-o'zidan ro'yxatdan o'tganlarga beriladigan rol */
export const SELF_REGISTER_ROLE = 'viewer';
