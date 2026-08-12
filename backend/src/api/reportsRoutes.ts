import { Router } from 'express';
import type { Db } from 'mongodb';
import { makeReportsController } from '../controllers/reports.controller.js';
import { requireAuth, requirePerm } from './middleware.js';

/**
 * Hisobot marshrutlari — 'reports.view' ruxsati talab qilinadi.
 * Mantiq controllers/reports.controller.ts da, biznes qatlam services/ da.
 */
export function reportsRouter(db: Db): Router {
  const r = Router();
  const c = makeReportsController(db);

  r.use(requireAuth(db), requirePerm('reports.view'));

  const wrap =
    (fn: (req: Parameters<typeof c.pnl>[0], res: Parameters<typeof c.pnl>[1]) => Promise<void>) =>
    (req: Parameters<typeof c.pnl>[0], res: Parameters<typeof c.pnl>[1], next: (e?: unknown) => void) =>
      fn(req, res).catch(next);

  r.get('/months', wrap(c.months));
  r.get('/reports/pnl', wrap(c.pnl));
  r.get('/reports/cashflow', wrap(c.cashflow));
  r.get('/reports/balance', wrap(c.balance));
  r.get('/reports/monthly', wrap(c.monthly));
  r.get('/reconcile', wrap(c.reconcile));

  return r;
}
