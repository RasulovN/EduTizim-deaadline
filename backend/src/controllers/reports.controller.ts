import type { Db } from 'mongodb';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { endOfDay, monthEnd } from '../domain/dates.js';
import { reconcile } from '../services/reconcile.js';
import {
  balanceSheet,
  cashFlowByMonth,
  listMonths,
  pnlByMonth,
} from '../services/reports.js';

/**
 * Hisobot controllerlari — HTTP qatlami: parametr validatsiyasi (zod)
 * va servis chaqiruvi. Biznes mantiq services/ da.
 */

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Oy formati: YYYY-MM');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: YYYY-MM-DD');

const rangeQuery = z.object({
  month: monthSchema.optional(),
  from: monthSchema.optional(),
  to: monthSchema.optional(),
});

async function resolveMonths(db: Db, q: z.infer<typeof rangeQuery>): Promise<string[] | undefined> {
  if (q.month) return [q.month];
  if (q.from && q.to) {
    const all = await listMonths(db);
    return all.filter((m) => m >= q.from! && m <= q.to!);
  }
  return undefined; // hamma oylar
}

export const makeReportsController = (db: Db) => ({
  async months(_req: Request, res: Response): Promise<void> {
    res.json({ months: await listMonths(db) });
  },

  async pnl(req: Request, res: Response): Promise<void> {
    const months = await resolveMonths(db, rangeQuery.parse(req.query));
    res.json({ reports: await pnlByMonth(db, months) });
  },

  async cashflow(req: Request, res: Response): Promise<void> {
    const months = await resolveMonths(db, rangeQuery.parse(req.query));
    res.json({ reports: await cashFlowByMonth(db, months) });
  },

  async balance(req: Request, res: Response): Promise<void> {
    const q = z
      .object({ date: dateSchema.optional(), month: monthSchema.optional() })
      .refine((v) => v.date || v.month, { message: 'date yoki month berilishi shart' })
      .parse(req.query);
    const asOf = q.date ? endOfDay(new Date(`${q.date}T00:00:00Z`)) : monthEnd(q.month!);
    res.json({ report: await balanceSheet(db, asOf) });
  },

  /** Frontend uchun qulaylik: bitta oyning uchala hisoboti bitta so'rovda */
  async monthly(req: Request, res: Response): Promise<void> {
    const q = z.object({ month: monthSchema }).parse(req.query);
    const [pnl, cf, bs] = await Promise.all([
      pnlByMonth(db, [q.month]),
      cashFlowByMonth(db, [q.month]),
      balanceSheet(db, monthEnd(q.month)),
    ]);
    res.json({ month: q.month, pnl: pnl[0] ?? null, cashflow: cf[0] ?? null, balance: bs });
  },

  /** Reconcile holati — frontendda "tengliklar mos" belgisi uchun */
  async reconcile(_req: Request, res: Response): Promise<void> {
    res.json(await reconcile(db));
  },
});
