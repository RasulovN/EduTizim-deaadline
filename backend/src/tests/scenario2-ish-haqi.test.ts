import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS } from '../domain/accounts.js';
import { monthEnd, utcDate } from '../domain/dates.js';
import { accrueSalaries, paySalaries } from '../services/postings.js';
import { balanceSheet, cashFlowByMonth, pnlByMonth } from '../services/reports.js';
import { setupTestDb, type TestContext } from './helpers.js';

/**
 * 5.2. Ish haqi
 * Xodimning oyligi 8 000 000 so'm. Yanvar oyi uchun ish haqi
 * 2026-02-05 kuni to'lanadi.
 */
describe('5.2 Ish haqi', () => {
  let ctx: TestContext;

  const salaryPayable = async (asOf: Date): Promise<number> => {
    const bs = await balanceSheet(ctx.db, asOf);
    return bs.liabilities.find((l) => l.code === ACCOUNTS.ISH_HAQI_QARZI.code)?.amount ?? 0;
  };

  beforeAll(async () => {
    ctx = await setupTestDb();
    // 31-yanvar: xodim yanvarda ishlab bo'ldi — xarajat yanvarga hisoblanadi
    await accrueSalaries(ctx.db, { month: '2026-01', amount: 8_000_000 });
    // 5-fevral: pul chiqdi
    await paySalaries(ctx.db, { date: utcDate(2026, 2, 5), amount: 8_000_000, forMonth: '2026-01' });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('Yanvar P&L: ish haqi xarajati = 8 000 000', async () => {
    const [jan] = await pnlByMonth(ctx.db, ['2026-01']);
    const salary = jan!.expenses.find((e) => e.code === ACCOUNTS.ISH_HAQI_XARAJATI.code);
    expect(salary?.amount).toBe(8_000_000);
  });

  it("31-yanvar balans: to'lanmagan ish haqi = 8 000 000", async () => {
    expect(await salaryPayable(monthEnd('2026-01'))).toBe(8_000_000);
  });

  it("Yanvar pul oqimi: jami o'zgarish = 0 (pul harakati yo'q)", async () => {
    const [jan] = await cashFlowByMonth(ctx.db, ['2026-01']);
    expect(jan!.netChange).toBe(0);
    expect(jan!.closing - jan!.opening).toBe(0);
  });

  it('Fevral P&L: shu ish haqidan kelib chiqqan xarajat = 0', async () => {
    const [feb] = await pnlByMonth(ctx.db, ['2026-02']);
    expect(feb!.totalExpenses).toBe(0);
  });

  it('Fevral pul oqimi: operatsion chiqim = 8 000 000', async () => {
    const [feb] = await cashFlowByMonth(ctx.db, ['2026-02']);
    expect(feb!.operating).toBe(-8_000_000);
  });

  it("28-fevral balans: to'lanmagan ish haqi = 0", async () => {
    expect(await salaryPayable(monthEnd('2026-02'))).toBe(0);
  });
});
