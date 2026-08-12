import 'dotenv/config';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { ZodError, z } from 'zod';
import { connectDb, ensureIndexes } from '../db.js';
import { endOfDay, monthEnd } from '../domain/dates.js';
import {
  balanceSheet,
  cashFlowByMonth,
  listMonths,
  pnlByMonth,
} from '../services/reports.js';
import { reconcile } from '../services/reconcile.js';

/**
 * REST API — uchta hisobot endpointi + yordamchilar.
 * Xavfsizlik: helmet (HTTP headerlar), cheklangan CORS,
 * zod bilan qat'iy kirish validatsiyasi, JSON hajm limiti.
 */

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Oy formati: YYYY-MM");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: YYYY-MM-DD');

const pnlQuery = z.object({
  month: monthSchema.optional(),
  from: monthSchema.optional(),
  to: monthSchema.optional(),
});

async function main(): Promise<void> {
  const db = await connectDb();
  await ensureIndexes(db);

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: CLIENT_ORIGIN }));
  app.use(express.json({ limit: '100kb' }));
  app.disable('x-powered-by');

  const wrap =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) =>
      fn(req, res).catch(next);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  /** Bazadagi oylar ro'yxati — frontend oy tanlagichi uchun */
  app.get(
    '/api/months',
    wrap(async (_req, res) => {
      res.json({ months: await listMonths(db) });
    }),
  );

  /** Foyda va zarar — ?month=YYYY-MM yoki ?from=&to= (oylar kesimida) */
  app.get(
    '/api/reports/pnl',
    wrap(async (req, res) => {
      const q = pnlQuery.parse(req.query);
      let months: string[] | undefined;
      if (q.month) months = [q.month];
      else if (q.from && q.to) {
        const all = await listMonths(db);
        months = all.filter((m) => m >= q.from! && m <= q.to!);
      }
      res.json({ reports: await pnlByMonth(db, months) });
    }),
  );

  /** Pul oqimi — ?month=YYYY-MM yoki ?from=&to= */
  app.get(
    '/api/reports/cashflow',
    wrap(async (req, res) => {
      const q = pnlQuery.parse(req.query);
      let months: string[] | undefined;
      if (q.month) months = [q.month];
      else if (q.from && q.to) {
        const all = await listMonths(db);
        months = all.filter((m) => m >= q.from! && m <= q.to!);
      }
      res.json({ reports: await cashFlowByMonth(db, months) });
    }),
  );

  /** Balans — ?date=YYYY-MM-DD yoki ?month=YYYY-MM (oy oxiriga) */
  app.get(
    '/api/reports/balance',
    wrap(async (req, res) => {
      const q = z
        .object({ date: dateSchema.optional(), month: monthSchema.optional() })
        .refine((v) => v.date || v.month, { message: 'date yoki month berilishi shart' })
        .parse(req.query);
      const asOf = q.date ? endOfDay(new Date(`${q.date}T00:00:00Z`)) : monthEnd(q.month!);
      res.json({ report: await balanceSheet(db, asOf) });
    }),
  );

  /** Frontend uchun qulaylik: bitta oyning uchala hisoboti bitta so'rovda */
  app.get(
    '/api/reports/monthly',
    wrap(async (req, res) => {
      const q = z.object({ month: monthSchema }).parse(req.query);
      const [pnl, cf, bs] = await Promise.all([
        pnlByMonth(db, [q.month]),
        cashFlowByMonth(db, [q.month]),
        balanceSheet(db, monthEnd(q.month)),
      ]);
      res.json({ month: q.month, pnl: pnl[0] ?? null, cashflow: cf[0] ?? null, balance: bs });
    }),
  );

  /** Reconcile holati — frontendda "tengliklar mos" belgisi uchun */
  app.get(
    '/api/reconcile',
    wrap(async (_req, res) => {
      res.json(await reconcile(db));
    }),
  );

  app.use((_req, res) => {
    res.status(404).json({ error: 'Topilmadi' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: "So'rov parametrlari noto'g'ri", details: err.issues });
      return;
    }
    console.error('[api] xato:', err);
    res.status(500).json({ error: 'Ichki server xatosi' });
  });

  app.listen(PORT, () => {
    console.log(`[api] http://localhost:${PORT} — tayyor`);
  });
}

main().catch((err) => {
  console.error('Server ishga tushmadi:', err);
  process.exit(1);
});
