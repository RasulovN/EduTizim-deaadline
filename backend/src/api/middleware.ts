import type { NextFunction, Request, Response } from 'express';
import type { Db } from 'mongodb';
import type { PermissionKey, RoleDoc, UserDoc } from '../domain/authTypes.js';
import {
  ACCESS_TTL_SEC,
  REFRESH_TTL_SEC,
  findRole,
  findUserById,
  verifyAccessToken,
} from '../services/authService.js';

/**
 * API middleware'lari: cookie'dagi JWT orqali autentifikatsiya,
 * rol-ruxsat tekshiruvi, CSRF (Origin) himoyasi va login rate-limit.
 */

export const ACCESS_COOKIE = 'edu_at';
export const REFRESH_COOKIE = 'edu_rt';

const IS_PROD = process.env.NODE_ENV === 'production';

/** httpOnly cookie sozlamalari — token JS ga ko'rinmaydi */
export function accessCookieOpts() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax' as const,
    maxAge: ACCESS_TTL_SEC * 1000,
    path: '/',
  };
}

export function refreshCookieOpts() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax' as const,
    maxAge: REFRESH_TTL_SEC * 1000,
    // faqat auth endpointlariga yuboriladi
    path: '/api/auth',
  };
}

export interface AuthedUser {
  user: UserDoc;
  role: RoleDoc;
  permissions: PermissionKey[];
}

// Express Request ga auth ma'lumotini bog'lash
declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthedUser;
  }
}

export function clientInfo(req: Request): { ip?: string; userAgent?: string } {
  return { ip: req.ip, userAgent: req.get('user-agent') ?? undefined };
}

/**
 * Cookie'dagi access tokenni tekshiradi, user + rolni yuklaydi.
 * Bloklangan user darhol chetlatiladi (token muddati kutmasdan).
 */
export function requireAuth(db: Db) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = (req.cookies as Record<string, string | undefined>)[ACCESS_COOKIE];
      const userId = token ? verifyAccessToken(token) : null;
      if (!userId) {
        res.status(401).json({ error: 'Avtorizatsiya talab qilinadi', code: 'UNAUTHENTICATED' });
        return;
      }
      const user = await findUserById(db, userId);
      if (!user) {
        res.status(401).json({ error: 'Foydalanuvchi topilmadi', code: 'UNAUTHENTICATED' });
        return;
      }
      if (!user.active) {
        res.status(403).json({ error: 'Hisobingiz bloklangan', code: 'BLOCKED' });
        return;
      }
      const role = await findRole(db, user.roleKey);
      req.auth = {
        user,
        role: role ?? fallbackRole(user.roleKey),
        permissions: role?.permissions ?? [],
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Rol o'chirilgan bo'lsa ham tizim yiqilmasin — ruxsatsiz bo'sh rol */
function fallbackRole(key: string): RoleDoc {
  return {
    key,
    name: key,
    description: '',
    permissions: [],
    system: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

export function requirePerm(perm: PermissionKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Avtorizatsiya talab qilinadi', code: 'UNAUTHENTICATED' });
      return;
    }
    if (!req.auth.permissions.includes(perm)) {
      res.status(403).json({ error: "Bu amal uchun ruxsatingiz yo'q", code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}

/**
 * CSRF himoyasi: cookie'ga asoslangan auth uchun mutatsion so'rovlarda
 * Origin sarlavhasi ruxsat etilgan ro'yxatda bo'lishi shart.
 * (SameSite=Lax bilan birga ikki qatlamli himoya.)
 */
export function csrfOriginCheck(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    const origin = req.get('origin');
    // Origin yo'q — brauzer bo'lmagan mijoz (curl, testlar); cookie CSRF xavfi yo'q
    if (!origin || allowed.has(origin)) {
      next();
      return;
    }
    res.status(403).json({ error: "So'rov manbasi (Origin) ruxsat etilmagan", code: 'BAD_ORIGIN' });
  };
}

/**
 * Oddiy in-memory rate-limit (login/forgot uchun):
 * bitta kalitga (email+ip) `max` urinish / `windowMs` oynasida.
 */
export function makeRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    /** true — ruxsat, false — limit oshgan */
    allow(key: string): boolean {
      const now = Date.now();
      const cur = hits.get(key);
      if (!cur || cur.resetAt < now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      cur.count += 1;
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
      }
      return cur.count <= max;
    },
    /** muvaffaqiyatli kirishda hisoblagichni tozalash */
    reset(key: string): void {
      hits.delete(key);
    },
  };
}
