import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS } from '../domain/accounts.js';
import { monthEnd, utcDate } from '../domain/dates.js';
import { equipmentPurchase } from '../services/postings.js';
import { balanceSheet, cashFlowByMonth, pnlByMonth } from '../services/reports.js';
import { setupTestDb, type TestContext } from './helpers.js';

/**
 * 5.5. Jihoz xaridi
 * 2026-01-08 kuni 240 000 000 so'mlik jihoz sotib olindi.
 * Xarajat EMAS: pul chiqdi, o'rniga aktiv keldi — investitsion chiqim.
 */
describe('5.5 Jihoz xaridi', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestDb();
    await equipmentPurchase(ctx.db, { date: utcDate(2026, 1, 8), amount: 240_000_000 });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('Yanvar P&L: xarajat = 0', async () => {
    const [jan] = await pnlByMonth(ctx.db, ['2026-01']);
    expect(jan!.totalExpenses).toBe(0);
  });

  it('31-yanvar balans: asosiy vositalar = 240 000 000', async () => {
    const bs = await balanceSheet(ctx.db, monthEnd('2026-01'));
    const fixed = bs.assets.find((l) => l.code === ACCOUNTS.ASOSIY_VOSITALAR.code);
    expect(fixed?.amount).toBe(240_000_000);
  });

  it('Yanvar pul oqimi: investitsion chiqim = 240 000 000', async () => {
    const [jan] = await cashFlowByMonth(ctx.db, ['2026-01']);
    expect(jan!.investing).toBe(-240_000_000);
  });

  it('balans tenglamasi buzilmagan (aktiv almashinuvi)', async () => {
    const bs = await balanceSheet(ctx.db, monthEnd('2026-01'));
    expect(bs.imbalance).toBe(0);
  });
});
