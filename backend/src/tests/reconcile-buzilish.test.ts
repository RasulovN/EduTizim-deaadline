import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { utcDate } from '../domain/dates.js';
import { journalEntries } from '../models/journal-entry.model.js';
import {
  accrueSalaries,
  equipmentPurchase,
  investorCapital,
  paySalaries,
  recognizeMonth,
  studentPayment,
} from '../services/postings.js';
import { reconcile } from '../services/reconcile.js';
import { setupTestDb, type TestContext } from './helpers.js';

/**
 * Reconcile "shunchaki PASS chiqaradigan" bezak emasligining isboti:
 * to'g'ri baza o'tadi, ledger validatsiyasini chetlab buzib qo'yilgan
 * bitta yozuv esa tekshiruvni yiqitadi.
 *
 * MUHIM: bu test production mantiqqa tegmaydi — buzilish faqat test
 * bazasiga to'g'ridan-to'g'ri (postEntry'siz) yoziladi.
 */
describe('Reconcile buzilishni sezadi', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestDb();
    const db = ctx.db;
    // Kichik, lekin har uch hisobotga tegadigan real stsenariy (yan–fev)
    await investorCapital(db, { date: utcDate(2026, 1, 5), amount: 100_000_000 });
    await studentPayment(db, {
      date: utcDate(2026, 1, 10),
      amount: 1_800_000,
      method: 'bank',
      allocations: [
        { month: '2026-01', amount: 600_000 },
        { month: '2026-02', amount: 600_000 },
        { month: '2026-03', amount: 600_000 },
      ],
    });
    await equipmentPurchase(db, { date: utcDate(2026, 1, 8), amount: 20_000_000 });
    await recognizeMonth(db, '2026-01');
    await accrueSalaries(db, { month: '2026-01', amount: 2_000_000 });
    await paySalaries(db, { date: utcDate(2026, 2, 5), amount: 2_000_000, forMonth: '2026-01' });
    await recognizeMonth(db, '2026-02');
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it("to'g'ri baza: uchala tenglik hamma oyda o'tadi", async () => {
    const result = await reconcile(ctx.db);
    expect(result.months).toBeGreaterThanOrEqual(2);
    expect(result.ok).toBe(true);
    for (const eq of result.equations) {
      expect(eq.mismatched).toBe(0);
      expect(eq.totalAbsDiff).toBe(0);
    }
  });

  it('buzilgan (balanslanmagan) yozuv reconcile ni yiqitadi', async () => {
    // Ledger validateEntry buni hech qachon o'tkazmaydi — ataylab
    // to'g'ridan-to'g'ri kolleksiyaga yozamiz: 5 mln pul chiqdi,
    // lekin xarajat 4 mln deb "yozib qo'yildi" (1 mln yo'qoldi).
    await journalEntries(ctx.db).insertOne({
      date: utcDate(2026, 2, 10),
      month: '2026-02',
      kind: 'expense_payment',
      memo: 'BUZILGAN YOZUV (faqat test uchun)',
      lines: [
        { account: '1100', debit: 0, credit: 5_000_000 },
        { account: '5200', debit: 4_000_000, credit: 0 },
      ],
    });

    const result = await reconcile(ctx.db);
    expect(result.ok).toBe(false);

    // Balans tenglamasi ham, pul oqimi bog'lanishi ham buzilishi shart
    const balanceEq = result.equations[0]!;
    const cashEq = result.equations[1]!;
    expect(balanceEq.mismatched).toBeGreaterThanOrEqual(1);
    expect(balanceEq.totalAbsDiff).toBe(1_000_000);
    expect(cashEq.mismatched).toBeGreaterThanOrEqual(1);
    // Yiqilgan oy aniq ko'rsatiladi — diagnostika uchun
    expect(balanceEq.failures.some((f) => f.month === '2026-02')).toBe(true);
  });
});
