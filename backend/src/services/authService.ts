import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ObjectId, type Db } from 'mongodb';
import {
  AUTH_COLLECTIONS,
  DEFAULT_ROLES,
  type ResetTokenDoc,
  type RoleDoc,
  type SessionDoc,
  type UserDoc,
} from '../domain/authTypes.js';

/**
 * Auth xizmati: JWT access token, rotatsiyalanadigan refresh sessiyalar,
 * parol tiklash tokenlari va tizim rollarini bootstrap qilish.
 *
 * Access token — qisqa umrli JWT (cookie'da), ichida faqat user id.
 * Refresh token — tasodifiy 256-bit qiymat; bazada sha256 xeshi saqlanadi
 * va har ishlatilganda almashtiriladi (rotation).
 */

const JWT_SECRET = process.env.JWT_SECRET ?? '';
const DEV_SECRET = 'dev-secret-o-zgartiring';

export function jwtSecret(): string {
  if (JWT_SECRET) return JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET env o‘rnatilishi shart (production)');
  }
  return DEV_SECRET;
}

export const ACCESS_TTL_SEC = 15 * 60; // 15 daqiqa
export const REFRESH_TTL_SEC = 30 * 24 * 60 * 60; // 30 kun
export const RESET_TTL_SEC = 30 * 60; // 30 daqiqa

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function signAccessToken(userId: ObjectId): string {
  return jwt.sign({ sub: userId.toHexString() }, jwtSecret(), {
    expiresIn: ACCESS_TTL_SEC,
  });
}

/** JWT ni tekshiradi, muvaffaqiyatda user id qaytaradi */
export function verifyAccessToken(token: string): ObjectId | null {
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (typeof payload === 'object' && typeof payload.sub === 'string') {
      return new ObjectId(payload.sub);
    }
    return null;
  } catch {
    return null;
  }
}

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export async function createSession(
  db: Db,
  userId: ObjectId,
  info: ClientInfo,
): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const doc: SessionDoc = {
    userId,
    tokenHash: sha256(token),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
    ip: info.ip,
    userAgent: info.userAgent?.slice(0, 256),
  };
  await db.collection<SessionDoc>(AUTH_COLLECTIONS.SESSIONS).insertOne(doc);
  return token;
}

/**
 * Refresh token rotatsiyasi: eski sessiya o'chiriladi, yangisi yaratiladi.
 * Yaroqsiz/muddati o'tgan token uchun null.
 */
export async function rotateSession(
  db: Db,
  token: string,
  info: ClientInfo,
): Promise<{ userId: ObjectId; token: string } | null> {
  const sessions = db.collection<SessionDoc>(AUTH_COLLECTIONS.SESSIONS);
  const found = await sessions.findOneAndDelete({ tokenHash: sha256(token) });
  if (!found || found.expiresAt.getTime() < Date.now()) return null;
  const next = await createSession(db, found.userId, info);
  return { userId: found.userId, token: next };
}

export async function destroySession(db: Db, token: string): Promise<void> {
  await db
    .collection<SessionDoc>(AUTH_COLLECTIONS.SESSIONS)
    .deleteOne({ tokenHash: sha256(token) });
}

export async function destroyAllSessions(db: Db, userId: ObjectId): Promise<void> {
  await db.collection<SessionDoc>(AUTH_COLLECTIONS.SESSIONS).deleteMany({ userId });
}

/** Parol tiklash tokeni yaratadi (eski tokenlar bekor qilinadi) */
export async function createResetToken(db: Db, userId: ObjectId): Promise<string> {
  const col = db.collection<ResetTokenDoc>(AUTH_COLLECTIONS.RESET_TOKENS);
  await col.deleteMany({ userId });
  const token = randomBytes(32).toString('hex');
  await col.insertOne({
    userId,
    tokenHash: sha256(token),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + RESET_TTL_SEC * 1000),
  });
  return token;
}

/** Tiklash tokenini bir martalik ishlatadi; yaroqsiz bo'lsa null */
export async function consumeResetToken(db: Db, token: string): Promise<ObjectId | null> {
  const col = db.collection<ResetTokenDoc>(AUTH_COLLECTIONS.RESET_TOKENS);
  const found = await col.findOneAndUpdate(
    { tokenHash: sha256(token), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  );
  return found ? found.userId : null;
}

export async function findUserByEmail(db: Db, email: string): Promise<UserDoc | null> {
  return db
    .collection<UserDoc>(AUTH_COLLECTIONS.USERS)
    .findOne({ email: email.toLowerCase().trim() });
}

export async function findUserById(db: Db, id: ObjectId): Promise<UserDoc | null> {
  return db.collection<UserDoc>(AUTH_COLLECTIONS.USERS).findOne({ _id: id });
}

export async function findRole(db: Db, key: string): Promise<RoleDoc | null> {
  return db.collection<RoleDoc>(AUTH_COLLECTIONS.ROLES).findOne({ key });
}

/** Tizim rollarini yaratadi (bor bo'lsa tegmaydi) va indekslarni o'rnatadi */
export async function ensureAuthSetup(db: Db): Promise<void> {
  await db
    .collection(AUTH_COLLECTIONS.USERS)
    .createIndexes([{ key: { email: 1 }, unique: true }, { key: { roleKey: 1 } }]);
  await db
    .collection(AUTH_COLLECTIONS.ROLES)
    .createIndexes([{ key: { key: 1 }, unique: true }]);
  await db.collection(AUTH_COLLECTIONS.SESSIONS).createIndexes([
    { key: { tokenHash: 1 }, unique: true },
    { key: { userId: 1 } },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ]);
  await db.collection(AUTH_COLLECTIONS.RESET_TOKENS).createIndexes([
    { key: { tokenHash: 1 } },
    { key: { expiresAt: 1 }, expireAfterSeconds: 3600 },
  ]);
  await db
    .collection(AUTH_COLLECTIONS.AUDIT_LOGS)
    .createIndexes([{ key: { ts: -1 } }, { key: { action: 1, ts: -1 } }, { key: { actorEmail: 1, ts: -1 } }]);

  const roles = db.collection<RoleDoc>(AUTH_COLLECTIONS.ROLES);
  const now = new Date();
  for (const role of DEFAULT_ROLES) {
    await roles.updateOne(
      { key: role.key },
      { $setOnInsert: { ...role, createdAt: now, updatedAt: now } },
      { upsert: true },
    );
  }
}

/** Bazada hech bo'lmasa bitta user bormi — birinchi register 'owner' bo'ladi */
export async function usersExist(db: Db): Promise<boolean> {
  const count = await db
    .collection(AUTH_COLLECTIONS.USERS)
    .countDocuments({}, { limit: 1 });
  return count > 0;
}
