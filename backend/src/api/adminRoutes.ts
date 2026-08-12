import { Router, type Request, type Response } from 'express';
import { ObjectId, type Db, type Filter } from 'mongodb';
import { z } from 'zod';
import {
  ALL_PERMISSION_KEYS,
  AUTH_COLLECTIONS,
  PERMISSIONS,
  type PermissionKey,
  type RoleDoc,
  type UserDoc,
} from '../domain/authTypes.js';
import { escapeRegex, listAuditLogs, writeAudit } from '../services/audit.js';
import { destroyAllSessions, findRole } from '../services/authService.js';
import { hashPassword } from '../services/passwords.js';
import { clientInfo, requireAuth, requirePerm } from './middleware.js';

/**
 * Admin marshrutlari:
 *   /api/users — foydalanuvchilar CRUD (rol tanlash bilan), paginatsiya
 *   /api/roles — rollar CRUD (ruxsatlar bilan), paginatsiya
 *   /api/logs  — audit loglar, filtr + paginatsiya
 */

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

const permissionSchema = z.enum(ALL_PERMISSION_KEYS as [PermissionKey, ...PermissionKey[]]);

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email("Email noto'g'ri"),
  password: z.string().min(8, 'Parol kamida 8 belgi').max(128),
  roleKey: z.string().trim().min(1, 'Rol tanlanishi shart'),
  active: z.boolean().default(true),
});

const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    roleKey: z.string().trim().min(1),
    active: z.boolean(),
    password: z.string().min(8).max(128),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "O'zgartirish uchun maydon berilmadi" });

const roleKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_-]{1,31}$/, "Kalit: kichik lotin harf/raqam, 2-32 belgi");

const createRoleSchema = z.object({
  key: roleKeySchema,
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).default(''),
  permissions: z.array(permissionSchema).default([]),
});

const updateRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(200),
    permissions: z.array(permissionSchema),
  })
  .partial();

const logsQuery = pageQuery.extend({
  action: z.string().trim().max(60).optional(),
  email: z.string().trim().max(120).optional(),
  ok: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

function publicUserRow(u: UserDoc, roleName: string) {
  return {
    id: u._id!.toHexString(),
    email: u.email,
    name: u.name,
    roleKey: u.roleKey,
    roleName,
    active: u.active,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt ?? null,
  };
}

function parseId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export function adminRouter(db: Db): Router {
  const r = Router();
  const users = db.collection<UserDoc>(AUTH_COLLECTIONS.USERS);
  const roles = db.collection<RoleDoc>(AUTH_COLLECTIONS.ROLES);

  const wrap =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: (e?: unknown) => void) =>
      fn(req, res).catch(next);

  r.use(requireAuth(db));

  /* ─────────────── Foydalanuvchilar ─────────────── */

  /** Ro'yxat: ?page=&limit=&search=&role= */
  r.get(
    '/users',
    requirePerm('users.manage'),
    wrap(async (req, res) => {
      const q = pageQuery
        .extend({
          search: z.string().trim().max(120).optional(),
          role: z.string().trim().max(40).optional(),
        })
        .parse(req.query);
      const filter: Filter<UserDoc> = {};
      if (q.search) {
        const rx = { $regex: escapeRegex(q.search), $options: 'i' };
        filter.$or = [{ email: rx }, { name: rx }];
      }
      if (q.role) filter.roleKey = q.role;

      const total = await users.countDocuments(filter);
      const items = await users
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .toArray();
      const roleDocs = await roles.find({}).toArray();
      const roleName = (key: string) => roleDocs.find((x) => x.key === key)?.name ?? key;
      res.json({
        items: items.map((u) => publicUserRow(u, roleName(u.roleKey))),
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.limit)),
      });
    }),
  );

  /** Yangi foydalanuvchi — rol majburiy tanlanadi */
  r.post(
    '/users',
    requirePerm('users.manage'),
    wrap(async (req, res) => {
      const body = createUserSchema.parse(req.body);
      const role = await findRole(db, body.roleKey);
      if (!role) {
        res.status(400).json({ error: `Rol topilmadi: ${body.roleKey}` });
        return;
      }
      // owner rolini faqat owner bera oladi
      if (role.key === 'owner' && req.auth!.role.key !== 'owner') {
        res.status(403).json({ error: "'Egasi' rolini faqat egasi bera oladi" });
        return;
      }
      const exists = await users.findOne({ email: body.email });
      if (exists) {
        res.status(409).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" });
        return;
      }
      const now = new Date();
      const doc: UserDoc = {
        email: body.email,
        name: body.name,
        passwordHash: await hashPassword(body.password),
        roleKey: role.key,
        active: body.active,
        createdAt: now,
        updatedAt: now,
      };
      const { insertedId } = await users.insertOne(doc);
      doc._id = insertedId;
      await writeAudit(db, {
        action: 'user.create',
        ok: true,
        actor: { id: req.auth!.user._id, email: req.auth!.user.email },
        target: body.email,
        details: { roleKey: role.key, active: body.active },
        ...clientInfo(req),
      });
      res.status(201).json({ user: publicUserRow(doc, role.name) });
    }),
  );

  /** Tahrirlash: ism / rol / holat / yangi parol */
  r.patch(
    '/users/:id',
    requirePerm('users.manage'),
    wrap(async (req, res) => {
      const id = parseId(req.params.id!);
      if (!id) {
        res.status(400).json({ error: "ID noto'g'ri" });
        return;
      }
      const body = updateUserSchema.parse(req.body);
      const target = await users.findOne({ _id: id });
      if (!target) {
        res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        return;
      }
      const me = req.auth!.user;
      const isSelf = target._id!.equals(me._id!);

      if (body.roleKey !== undefined) {
        const role = await findRole(db, body.roleKey);
        if (!role) {
          res.status(400).json({ error: `Rol topilmadi: ${body.roleKey}` });
          return;
        }
        if ((role.key === 'owner' || target.roleKey === 'owner') && req.auth!.role.key !== 'owner') {
          res.status(403).json({ error: "'Egasi' roli bilan bog'liq o'zgarishni faqat egasi qila oladi" });
          return;
        }
        if (isSelf && target.roleKey === 'owner' && role.key !== 'owner') {
          const owners = await users.countDocuments({ roleKey: 'owner', active: true });
          if (owners <= 1) {
            res.status(400).json({ error: "Tizimda kamida bitta faol 'Egasi' qolishi shart" });
            return;
          }
        }
      }
      if (body.active === false && isSelf) {
        res.status(400).json({ error: "O'zingizni bloklab bo'lmaysiz" });
        return;
      }
      if (body.active === false && target.roleKey === 'owner' && req.auth!.role.key !== 'owner') {
        res.status(403).json({ error: "'Egasi'ni faqat boshqa egasi bloklashi mumkin" });
        return;
      }

      const $set: Partial<UserDoc> = { updatedAt: new Date() };
      if (body.name !== undefined) $set.name = body.name;
      if (body.roleKey !== undefined) $set.roleKey = body.roleKey;
      if (body.active !== undefined) $set.active = body.active;
      if (body.password !== undefined) $set.passwordHash = await hashPassword(body.password);
      await users.updateOne({ _id: id }, { $set });

      // Bloklash yoki parol almashtirishda sessiyalari bekor qilinadi
      if (body.active === false || body.password !== undefined) {
        await destroyAllSessions(db, id);
      }
      await writeAudit(db, {
        action: 'user.update',
        ok: true,
        actor: { id: me._id, email: me.email },
        target: target.email,
        details: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.roleKey !== undefined ? { roleKey: body.roleKey } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
          ...(body.password !== undefined ? { passwordReset: true } : {}),
        },
        ...clientInfo(req),
      });
      const updated = (await users.findOne({ _id: id }))!;
      const role = await findRole(db, updated.roleKey);
      res.json({ user: publicUserRow(updated, role?.name ?? updated.roleKey) });
    }),
  );

  r.delete(
    '/users/:id',
    requirePerm('users.manage'),
    wrap(async (req, res) => {
      const id = parseId(req.params.id!);
      if (!id) {
        res.status(400).json({ error: "ID noto'g'ri" });
        return;
      }
      const target = await users.findOne({ _id: id });
      if (!target) {
        res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        return;
      }
      if (target._id!.equals(req.auth!.user._id!)) {
        res.status(400).json({ error: "O'z hisobingizni o'chira olmaysiz" });
        return;
      }
      if (target.roleKey === 'owner') {
        if (req.auth!.role.key !== 'owner') {
          res.status(403).json({ error: "'Egasi'ni faqat boshqa egasi o'chira oladi" });
          return;
        }
        const owners = await users.countDocuments({ roleKey: 'owner' });
        if (owners <= 1) {
          res.status(400).json({ error: "Tizimda kamida bitta 'Egasi' qolishi shart" });
          return;
        }
      }
      await users.deleteOne({ _id: id });
      await destroyAllSessions(db, id);
      await writeAudit(db, {
        action: 'user.delete',
        ok: true,
        actor: { id: req.auth!.user._id, email: req.auth!.user.email },
        target: target.email,
        ...clientInfo(req),
      });
      res.json({ ok: true });
    }),
  );

  /* ─────────────── Rollar ─────────────── */

  /** Ruxsatlar katalogi — rol tahrirlagich checkboxlari uchun */
  r.get('/roles/permissions', requirePerm('roles.manage'), (_req, res) => {
    res.json({ permissions: PERMISSIONS });
  });

  /**
   * Rollar ro'yxati (paginatsiyali). limit=100 bilan so'ralsa,
   * user formasi uchun to'liq ro'yxat sifatida ham xizmat qiladi.
   * users.manage huquqi ham yetadi (user qo'shishda rol tanlash uchun).
   */
  r.get(
    '/roles',
    wrap(async (req, res) => {
      const perms = req.auth!.permissions;
      if (!perms.includes('roles.manage') && !perms.includes('users.manage')) {
        res.status(403).json({ error: "Bu amal uchun ruxsatingiz yo'q", code: 'FORBIDDEN' });
        return;
      }
      const q = pageQuery.parse(req.query);
      const total = await roles.countDocuments({});
      const items = await roles
        .find({})
        .sort({ system: -1, key: 1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .toArray();
      const userCounts = await users
        .aggregate<{ _id: string; n: number }>([
          { $group: { _id: '$roleKey', n: { $sum: 1 } } },
        ])
        .toArray();
      res.json({
        items: items.map((role) => ({
          id: role._id!.toHexString(),
          key: role.key,
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          system: role.system,
          users: userCounts.find((c) => c._id === role.key)?.n ?? 0,
          updatedAt: role.updatedAt,
        })),
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.limit)),
      });
    }),
  );

  r.post(
    '/roles',
    requirePerm('roles.manage'),
    wrap(async (req, res) => {
      const body = createRoleSchema.parse(req.body);
      const exists = await roles.findOne({ key: body.key });
      if (exists) {
        res.status(409).json({ error: `'${body.key}' kalitli rol allaqachon mavjud` });
        return;
      }
      const now = new Date();
      const doc: RoleDoc = { ...body, system: false, createdAt: now, updatedAt: now };
      await roles.insertOne(doc);
      await writeAudit(db, {
        action: 'role.create',
        ok: true,
        actor: { id: req.auth!.user._id, email: req.auth!.user.email },
        target: body.key,
        details: { permissions: body.permissions },
        ...clientInfo(req),
      });
      res.status(201).json({ ok: true });
    }),
  );

  r.patch(
    '/roles/:key',
    requirePerm('roles.manage'),
    wrap(async (req, res) => {
      const key = req.params.key!;
      const body = updateRoleSchema.parse(req.body);
      const role = await roles.findOne({ key });
      if (!role) {
        res.status(404).json({ error: 'Rol topilmadi' });
        return;
      }
      // owner rolining ruxsatlarini qisqartirib bo'lmaydi — tizim qulflanib qolmasin
      if (role.key === 'owner' && body.permissions) {
        res.status(400).json({ error: "'Egasi' roli ruxsatlarini o'zgartirib bo'lmaydi" });
        return;
      }
      await roles.updateOne({ key }, { $set: { ...body, updatedAt: new Date() } });
      await writeAudit(db, {
        action: 'role.update',
        ok: true,
        actor: { id: req.auth!.user._id, email: req.auth!.user.email },
        target: key,
        details: body,
        ...clientInfo(req),
      });
      res.json({ ok: true });
    }),
  );

  r.delete(
    '/roles/:key',
    requirePerm('roles.manage'),
    wrap(async (req, res) => {
      const key = req.params.key!;
      const role = await roles.findOne({ key });
      if (!role) {
        res.status(404).json({ error: 'Rol topilmadi' });
        return;
      }
      if (role.system) {
        res.status(400).json({ error: "Tizim rolini o'chirib bo'lmaydi" });
        return;
      }
      const inUse = await users.countDocuments({ roleKey: key });
      if (inUse > 0) {
        res.status(400).json({ error: `Bu rol ${inUse} ta foydalanuvchiga biriktirilgan — avval ularni boshqa rolga o'tkazing` });
        return;
      }
      await roles.deleteOne({ key });
      await writeAudit(db, {
        action: 'role.delete',
        ok: true,
        actor: { id: req.auth!.user._id, email: req.auth!.user.email },
        target: key,
        ...clientInfo(req),
      });
      res.json({ ok: true });
    }),
  );

  /* ─────────────── Audit loglar ─────────────── */

  r.get(
    '/logs',
    requirePerm('logs.view'),
    wrap(async (req, res) => {
      const q = logsQuery.parse(req.query);
      const page = await listAuditLogs(db, q);
      res.json({
        ...page,
        items: page.items.map((l) => ({
          id: l._id!.toHexString(),
          ts: l.ts,
          action: l.action,
          ok: l.ok,
          actorEmail: l.actorEmail ?? null,
          target: l.target ?? null,
          details: l.details ?? null,
          ip: l.ip ?? null,
        })),
      });
    }),
  );

  return r;
}
