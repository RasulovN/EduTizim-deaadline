import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS } from '../domain/accounts.js';
import { monthEnd, utcDate } from '../domain/dates.js';
import { loanPayment, loanReceived } from '../services/postings.js';
import { balanceSheet, cashFlowByMonth, pnlByMonth } from '../services/reports.js';
import { setupTestDb, type TestContext } from './helpers.js';

/**
 * 5.4. Kredit to'lovi
 * 2026-02-01: bankdan 200 000 000 so'm kredit (yillik 18%).
 * 2026-02-20: birinchi to'lov 12 000 000 = foiz 3 000 000 + asosiy qarz 9 000 000.
 * Faqat foiz — xarajat. Asosiy qarz — moliyaviy chiqim.
 */
describe("5.4 Kredit to'lovi", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestDb();
    await loanReceived(ctx.db, { date: utcDate(2026, 2, 1), amount: 200_000_000 });
    await loanPayment(ctx.db, {
      date: utcDate(2026, 2, 20),
      principal: 9_000_000,
      interest: 3_000_000,
    });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('Fevral P&L: shu kreditdan kelib chiqqan xarajat = 3 000 000 (faqat foiz)', async () => {
    const [feb] = await pnlByMonth(ctx.db, ['2026-02']);
    expect(feb!.totalExpenses).toBe(3_000_000);
    const interest = feb!.expenses.find((e) => e.code === ACCOUNTS.KREDIT_FOIZI.code);
    expect(interest?.amount).toBe(3_000_000);
  });

  it('28-fevral balans: kredit qarzi = 191 000 000', async () => {
    const bs = await balanceSheet(ctx.db, monthEnd('2026-02'));
    const loan = bs.liabilities.find((l) => l.code === ACCOUNTS.BANK_KREDITI.code);
    expect(loan?.amount).toBe(191_000_000);
  });

  it('Fevral pul oqimi: moliyaviy = +191 000 000 (olindi 200M − asosiy qarz 9M)', async () => {
    const [feb] = await cashFlowByMonth(ctx.db, ['2026-02']);
    expect(feb!.financing).toBe(191_000_000);
  });

  it('Fevral pul oqimi: operatsion chiqim (foiz) = 3 000 000', async () => {
    const [feb] = await cashFlowByMonth(ctx.db, ['2026-02']);
    expect(feb!.operating).toBe(-3_000_000);
  });
});
