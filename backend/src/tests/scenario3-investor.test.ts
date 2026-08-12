import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { monthEnd, utcDate } from '../domain/dates.js';
import { investorCapital } from '../services/postings.js';
import { balanceSheet, cashFlowByMonth, pnlByMonth } from '../services/reports.js';
import { setupTestDb, type TestContext } from './helpers.js';

/**
 * 5.3. Investor kapitali
 * Investor 2026-01-05 kuni 500 000 000 so'm kiritdi.
 * Kapital — daromad EMAS: P&L ga tegmaydi, pul oqimida moliyaviy kirim.
 */
describe('5.3 Investor kapitali', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestDb();
    await investorCapital(ctx.db, {
      date: utcDate(2026, 1, 5),
      amount: 500_000_000,
      investor: 'Investor',
    });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('Yanvar P&L: daromad = 0', async () => {
    const [jan] = await pnlByMonth(ctx.db, ['2026-01']);
    expect(jan!.totalRevenue).toBe(0);
  });

  it('Yanvar P&L: sof foyda = 0', async () => {
    const [jan] = await pnlByMonth(ctx.db, ['2026-01']);
    expect(jan!.netProfit).toBe(0);
  });

  it('31-yanvar balans: kapital = 500 000 000', async () => {
    const bs = await balanceSheet(ctx.db, monthEnd('2026-01'));
    expect(bs.totalEquity).toBe(500_000_000);
  });

  it('Yanvar pul oqimi: moliyaviy kirim = 500 000 000', async () => {
    const [jan] = await cashFlowByMonth(ctx.db, ['2026-01']);
    expect(jan!.financing).toBe(500_000_000);
  });

  it('Yanvar pul oqimi: operatsion = 0', async () => {
    const [jan] = await cashFlowByMonth(ctx.db, ['2026-01']);
    expect(jan!.operating).toBe(0);
  });
});
