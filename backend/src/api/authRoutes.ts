import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { z } from 'zod';
import {
  AUTH_COLLECTIONS,
  SELF_REGISTER_ROLE,
  type UserDoc,
} from '../domain/authTypes.js';
import { writeAudit } from '../services/audit.js';
import {
  consumeResetToken,
  createResetToken,
  createSession,
  destroyAllSessions,
  destroySession,
  findRole,
  findUserByEmail,
  findUserById,
  rotateSession,
  signAccessToken,
  usersExist,
} from '../services/authService.js';
import { hashPassword, verifyPassword } from '../services/passwords.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOpts,
  clientInfo,
  makeRateLimiter,
  refreshCookieOpts,
  requireAuth,
} from './middleware.js';

/**
 * Auth marshrutlari: ro'yxatdan o'tish, kirish/chiqish, token yangilash,
 * parolni unutish/tiklash va profil sozlamalari.
 *
 * Tokenlar FAQAT httpOnly cookie'larda — JS ga chiqmaydi.
 */

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email manzil noto'g'ri");
const passwordSchema = z
  .string()
  .min(8, "Parol kamida 8 belgidan iborat bo'lsin")
  .max(128, 'Parol juda uzun');
const nameSchema = z.string().trim().min(2, "Ism juda qisqa").max(80, 'Ism juda uzun');

const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1) });
const forgotSchema = z.object({ email: emailSchema });
const resetSchema = z.object({ token: z.string().min(32), password: passwordSchema });
const profileSchema = z.object({ name: nameSchema });
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Joriy parol kiritilishi shart'),
  newPassword: passwordSchema,
});

/** Frontendga qaytariladigan xavfsiz user ko'rinishi */
function publicUser(u: UserDoc, roleName: string, permissions: string[]) {
  return {
    id: u._id!.toHexString(),
    email: u.email,
    name: u.name,
    roleKey: u.roleKey,
    roleName,
    permissions,
    active: u.active,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt ?? null,
  };
}

async function setAuthCookies(db: Db, res: Response, user: UserDoc, req: Request) {
  const access = signAccessToken(user._id!);
  const refresh = await createSession(db, user._id!, clientInfo(req));
  res.cookie(ACCESS_COOKIE, access, accessCookieOpts());
  res.cookie(REFRESH_COOKIE, refresh, refreshCookieOpts());
}

function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...accessCookieOpts(), maxAge: undefined });
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOpts(), maxAge: undefined });
}

export function authRouter(db: Db): Router {
  const r = Router();
  const loginLimiter = makeRateLimiter(5, 15 * 60 * 1000);
  const forgotLimiter = makeRateLimiter(3, 15 * 60 * 1000);
  const allowRegister = (process.env.ALLOW_REGISTER ?? 'true') !== 'false';

  const wrap =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: (e?: unknown) => void) =>
      fn(req, res).catch(next);

  /** Ro'yxatdan o'tish. Birinchi foydalanuvchi — 'owner', qolganlar — viewer. */
  r.post(
    '/register',
    wrap(async (req, res) => {
      if (!allowRegister) {
        res.status(403).json({ error: "Ro'yxatdan o'tish o'chirilgan — administratorga murojaat qiling" });
        return;
      }
      const body = registerSchema.parse(req.body);
      const exists = await findUserByEmail(db, body.email);
      if (exists) {
        res.status(409).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" });
        return;
      }
      const first = !(await usersExist(db));
      const roleKey = first ? 'owner' : SELF_REGISTER_ROLE;
      const now = new Date();
      const user: UserDoc = {
        email: body.email,
        name: body.name,
        passwordHash: await hashPassword(body.password),
        roleKey,
        active: true,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      };
      const { insertedId } = await db
        .collection<UserDoc>(AUTH_COLLECTIONS.USERS)
        .insertOne(user);
      user._id = insertedId;

      await setAuthCookies(db, res, user, req);
      await writeAudit(db, {
        action: 'auth.register',
        ok: true,
        actor: { id: insertedId, email: user.email },
        target: user.email,
        details: { roleKey, first },
        ...clientInfo(req),
      });
      const role = await findRole(db, roleKey);
      res.status(201).json({ user: publicUser(user, role?.name ?? roleKey, role?.permissions ?? []) });
    }),
  );

  /** Kirish — muvaffaqiyatsiz urinishlar ham audit logga yoziladi */
  r.post(
    '/login',
    wrap(async (req, res) => {
      const body = loginSchema.parse(req.body);
      const rlKey = `${body.email}|${req.ip}`;
      if (!loginLimiter.allow(rlKey)) {
        await writeAudit(db, {
          action: 'auth.login_ratelimited',
          ok: false,
          target: body.email,
          ...clientInfo(req),
        });
        res.status(429).json({ error: "Juda ko'p urinish. 15 daqiqadan so'ng qayta urining." });
        return;
      }
      const user = await findUserByEmail(db, body.email);
      const valid = user && (await verifyPassword(body.password, user.passwordHash));
      if (!user || !valid) {
        await writeAudit(db, {
          action: 'auth.login_failed',
          ok: false,
          target: body.email,
          details: { reason: user ? 'wrong_password' : 'no_user' },
          ...clientInfo(req),
        });
        res.status(401).json({ error: "Email yoki parol noto'g'ri" });
        return;
      }
      if (!user.active) {
        await writeAudit(db, {
          action: 'auth.login_blocked',
          ok: false,
          actor: { id: user._id, email: user.email },
          target: user.email,
          ...clientInfo(req),
        });
        res.status(403).json({ error: 'Hisobingiz bloklangan — administratorga murojaat qiling' });
        return;
      }
      loginLimiter.reset(rlKey);
      await db
        .collection<UserDoc>(AUTH_COLLECTIONS.USERS)
        .updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
      await setAuthCookies(db, res, user, req);
      await writeAudit(db, {
        action: 'auth.login',
        ok: true,
        actor: { id: user._id, email: user.email },
        target: user.email,
        ...clientInfo(req),
      });
      const role = await findRole(db, user.roleKey);
      res.json({ user: publicUser(user, role?.name ?? user.roleKey, role?.permissions ?? []) });
    }),
  );

  /** Access token muddati tugaganda cookie'dagi refresh orqali yangilash */
  r.post(
    '/refresh',
    wrap(async (req, res) => {
      const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
      if (!token) {
        res.status(401).json({ error: 'Sessiya topilmadi', code: 'NO_REFRESH' });
        return;
      }
      const rotated = await rotateSession(db, token, clientInfo(req));
      if (!rotated) {
        clearAuthCookies(res);
        res.status(401).json({ error: 'Sessiya muddati tugagan — qayta kiring', code: 'SESSION_EXPIRED' });
        return;
      }
      const user = await findUserById(db, rotated.userId);
      if (!user || !user.active) {
        clearAuthCookies(res);
        res.status(401).json({ error: 'Hisob faol emas', code: 'SESSION_EXPIRED' });
        return;
      }
      res.cookie(ACCESS_COOKIE, signAccessToken(user._id!), accessCookieOpts());
      res.cookie(REFRESH_COOKIE, rotated.token, refreshCookieOpts());
      res.json({ ok: true });
    }),
  );

  r.post(
    '/logout',
    wrap(async (req, res) => {
      const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
      if (token) await destroySession(db, token);
      clearAuthCookies(res);
      res.json({ ok: true });
    }),
  );

  /** Joriy foydalanuvchi — sahifa yangilanganda sessiyani tiklash uchun */
  r.get(
    '/me',
    requireAuth(db),
    wrap(async (req, res) => {
      const { user, role, permissions } = req.auth!;
      res.json({ user: publicUser(user, role.name, permissions) });
    }),
  );

  /**
   * Parolni unutish. Email topilsa tiklash tokeni yaratiladi.
   * SMTP integratsiyasi yo'q — havola server konsoliga chiqadi;
   * developmentda javobda ham qaytariladi (qulay sinov uchun).
   * Email bor-yo'qligi javobdan bilinmaydi (enumeration himoyasi).
   */
  r.post(
    '/forgot',
    wrap(async (req, res) => {
      const body = forgotSchema.parse(req.body);
      if (!forgotLimiter.allow(`${body.email}|${req.ip}`)) {
        res.status(429).json({ error: "Juda ko'p urinish. Birozdan so'ng qayta urining." });
        return;
      }
      const user = await findUserByEmail(db, body.email);
      let devToken: string | undefined;
      if (user) {
        const token = await createResetToken(db, user._id!);
        const origin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
        console.log(`[auth] Parol tiklash havolasi (${user.email}): ${origin}/reset-password?token=${token}`);
        if (process.env.NODE_ENV !== 'production') devToken = token;
      }
      await writeAudit(db, {
        action: 'auth.forgot',
        ok: Boolean(user),
        target: body.email,
        ...clientInfo(req),
      });
      res.json({
        ok: true,
        message: "Agar bu email ro'yxatdan o'tgan bo'lsa, tiklash havolasi yuborildi.",
        ...(devToken ? { devToken } : {}),
      });
    }),
  );

  /** Yangi parol o'rnatish — token bir martalik, barcha sessiyalar bekor */
  r.post(
    '/reset',
    wrap(async (req, res) => {
      const body = resetSchema.parse(req.body);
      const userId = await consumeResetToken(db, body.token);
      if (!userId) {
        res.status(400).json({ error: 'Havola yaroqsiz yoki muddati tugagan' });
        return;
      }
      const passwordHash = await hashPassword(body.password);
      const user = await findUserById(db, userId);
      await db
        .collection<UserDoc>(AUTH_COLLECTIONS.USERS)
        .updateOne({ _id: userId }, { $set: { passwordHash, updatedAt: new Date() } });
      await destroyAllSessions(db, userId);
      clearAuthCookies(res);
      await writeAudit(db, {
        action: 'auth.reset',
        ok: true,
        actor: { id: userId, email: user?.email },
        target: user?.email,
        ...clientInfo(req),
      });
      res.json({ ok: true, message: 'Parol yangilandi — endi yangi parol bilan kiring.' });
    }),
  );

  /** Profil: ismni yangilash */
  r.patch(
    '/profile',
    requireAuth(db),
    wrap(async (req, res) => {
      const body = profileSchema.parse(req.body);
      const { user, role, permissions } = req.auth!;
      await db
        .collection<UserDoc>(AUTH_COLLECTIONS.USERS)
        .updateOne({ _id: user._id }, { $set: { name: body.name, updatedAt: new Date() } });
      await writeAudit(db, {
        action: 'profile.update',
        ok: true,
        actor: { id: user._id, email: user.email },
        target: user.email,
        details: { name: body.name },
        ...clientInfo(req),
      });
      res.json({ user: publicUser({ ...user, name: body.name }, role.name, permissions) });
    }),
  );

  /** Profil: parolni joriy parol bilan almashtirish */
  r.post(
    '/change-password',
    requireAuth(db),
    wrap(async (req, res) => {
      const body = changePasswordSchema.parse(req.body);
      const { user } = req.auth!;
      const ok = await verifyPassword(body.currentPassword, user.passwordHash);
      if (!ok) {
        await writeAudit(db, {
          action: 'profile.password_failed',
          ok: false,
          actor: { id: user._id, email: user.email },
          target: user.email,
          ...clientInfo(req),
        });
        res.status(400).json({ error: "Joriy parol noto'g'ri" });
        return;
      }
      const passwordHash = await hashPassword(body.newPassword);
      await db
        .collection<UserDoc>(AUTH_COLLECTIONS.USERS)
        .updateOne({ _id: user._id }, { $set: { passwordHash, updatedAt: new Date() } });
      // Boshqa qurilmalardagi sessiyalar bekor qilinadi; joriy qurilma qayta login qilmasin
      await destroyAllSessions(db, user._id!);
      await setAuthCookies(db, res, user, req);
      await writeAudit(db, {
        action: 'profile.password',
        ok: true,
        actor: { id: user._id, email: user.email },
        target: user.email,
        ...clientInfo(req),
      });
      res.json({ ok: true, message: 'Parol muvaffaqiyatli o‘zgartirildi' });
    }),
  );

  return r;
}
