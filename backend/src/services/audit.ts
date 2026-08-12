import type { Db, Filter, ObjectId } from 'mongodb';
import { AUTH_COLLECTIONS, type AuditLogDoc } from '../domain/authTypes.js';

/**
 * Audit log xizmati: har bir muhim hodisa (login, CRUD, parol tiklash)
 * bazaga yoziladi va paginatsiya bilan o'qiladi.
 */

export interface AuditActor {
  id?: ObjectId;
  email?: string;
}

export interface AuditWrite {
  action: string;
  ok: boolean;
  actor?: AuditActor;
  target?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export async function writeAudit(db: Db, e: AuditWrite): Promise<void> {
  const doc: AuditLogDoc = {
    ts: new Date(),
    action: e.action,
    ok: e.ok,
    actorId: e.actor?.id,
    actorEmail: e.actor?.email,
    target: e.target,
    details: e.details,
    ip: e.ip,
    userAgent: e.userAgent?.slice(0, 256),
  };
  // Audit yozuvi asosiy oqimni to'xtatmasligi kerak
  await db
    .collection<AuditLogDoc>(AUTH_COLLECTIONS.AUDIT_LOGS)
    .insertOne(doc)
    .catch((err) => console.error('[audit] yozib bo\'lmadi:', err));
}

export interface AuditQuery {
  page: number;
  limit: number;
  action?: string;
  email?: string;
  ok?: boolean;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function listAuditLogs(
  db: Db,
  q: AuditQuery,
): Promise<Paginated<AuditLogDoc>> {
  const filter: Filter<AuditLogDoc> = {};
  if (q.action) filter.action = { $regex: `^${escapeRegex(q.action)}` };
  if (q.email) filter.actorEmail = { $regex: escapeRegex(q.email), $options: 'i' };
  if (q.ok !== undefined) filter.ok = q.ok;

  const col = db.collection<AuditLogDoc>(AUTH_COLLECTIONS.AUDIT_LOGS);
  const total = await col.countDocuments(filter);
  const items = await col
    .find(filter)
    .sort({ ts: -1 })
    .skip((q.page - 1) * q.limit)
    .limit(q.limit)
    .toArray();
  return {
    items,
    page: q.page,
    limit: q.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.limit)),
  };
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
