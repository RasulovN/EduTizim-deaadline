import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { utcDate, monthEnd } from '../domain/dates.js';
import { recognizeMonth, studentPayment } from '../services/postings.js';
import { balanceSheet, cashFlowByMonth, deferredRevenueAsOf, pnlByMonth } from '../services/reports.js';
import { setupTestDb, type TestContext } from './helpers.js';

/**
 * 5.1. Oldindan to'lov
 * O'quvchi 2026-01-10 kuni 1 800 000 so'm to'ladi — yanvar, fevral va
 * mart uchun (oyiga 600 000).
 */
describe("5.1 Oldindan to'lov", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestDb();
    await studentPayment(ctx.db, {
      date: utcDate(2026, 1, 10),
      amount: 1_800_000,
      method: 'bank',
      allocations: [
        { month: '2026-01', amount: 600_000 },
        { month: '2026-02', amount: 600_000 },
        { month: '2026-03', amount: 600_000 },
      ],
    });
    // Oy yopilishlari: darslar o'tildi
    await recognizeMonth(ctx.db, '2026-01');
    await recognizeMonth(ctx.db, '2026-02');
    await recognizeMonth(ctx.db, '2026-03');
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('Yanvar P&L: daromad = 600 000', async () => {
    const [jan] = await pnlByMonth(ctx.db, ['2026-01']);
    expect(jan!.totalRevenue).toBe(600_000);
  });

  it("31-yanvar balans: oldindan to'langan darslar = 1 200 000", async () => {
    expect(await deferredRevenueAsOf(ctx.db, monthEnd('2026-01'))).toBe(1_200_000);
  });

  it('Yanvar pul oqimi: operatsion kirim = 1 800 000', async () => {
    const [jan] = await cashFlowByMonth(ctx.db, ['2026-01']);
    expect(jan!.operating).toBe(1_800_000);
  });

  it("31-mart balans: oldindan to'langan darslar = 0", async () => {
    expect(await deferredRevenueAsOf(ctx.db, monthEnd('2026-03'))).toBe(0);
  });

  it('Yanvar–mart jami daromad = 1 800 000', async () => {
    const months = await pnlByMonth(ctx.db, ['2026-01', '2026-02', '2026-03']);
    const total = months.reduce((s, m) => s + m.totalRevenue, 0);
    expect(total).toBe(1_800_000);
  });

  it('balans tenglamasi buzilmagan', async () => {
    const bs = await balanceSheet(ctx.db, monthEnd('2026-03'));
    expect(bs.imbalance).toBe(0);
  });
});
