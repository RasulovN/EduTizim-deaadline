import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, CASH_CODES } from '../domain/accounts.js';
import { monthEnd, utcDate } from '../domain/dates.js';
import {
  accrueSalaries,
  cashTransfer,
  investorCapital,
  payExpense,
  paySalaries,
  recognizeMonth,
  studentPayment,
} from '../services/postings.js';
import { balanceSheet, cashFlowByMonth, pnlByMonth, profitCashBridge } from '../services/reports.js';
import { setupTestDb, type TestContext } from './helpers.js';

/**
 * Topshiriqning 2.3-bo'limidagi yanvar misoli — RAQAMMA-RAQAM.
 * "Foyda 13 mln, lekin pul 55 mln ga oshdi" — tizim aynan shu
 * natijani berishi kerak.
 */
describe("2.3-misol: foyda 13 mln, pul +55 mln", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestDb();
    const db = ctx.db;

    // Oy boshida markazda 50 mln bor edi (dekabrda kiritilgan kapital)
    await investorCapital(db, { date: utcDate(2025, 12, 15), amount: 50_000_000 });
    // Dekabr ish haqi hisoblangan edi (30 mln) — 5-yanvarda to'lanadi
    await accrueSalaries(db, { month: '2025-12', amount: 30_000_000 });

    // 3-yanvar: o'quvchilardan 100 mln (60 mln yanvar uchun, 40 mln oldindan)
    await studentPayment(db, {
      date: utcDate(2026, 1, 3),
      amount: 100_000_000,
      method: 'bank',
      allocations: [
        { month: '2026-01', amount: 60_000_000 },
        { month: '2026-02', amount: 20_000_000 },
        { month: '2026-03', amount: 20_000_000 },
      ],
    });
    // 5-yanvar: DEKABR ish haqi to'landi
    await paySalaries(db, { date: utcDate(2026, 1, 5), amount: 30_000_000, forMonth: '2025-12' });
    // 5-yanvar: yanvar ijarasi
    await payExpense(db, { date: utcDate(2026, 1, 5), amount: 10_000_000, expense: 'ijara' });
    // 15-yanvar: marketing
    await payExpense(db, { date: utcDate(2026, 1, 15), amount: 5_000_000, expense: 'marketing' });
    // 31-yanvar: darslar o'tildi → daromad tan olindi (60 mln)
    await recognizeMonth(db, '2026-01');
    // 31-yanvar: YANVAR ish haqi hisoblandi (32 mln, 5-fevralda to'lanadi)
    await accrueSalaries(db, { month: '2026-01', amount: 32_000_000 });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('Yanvar P&L: daromad 60 mln, sof foyda 13 mln', async () => {
    const [jan] = await pnlByMonth(ctx.db, ['2026-01']);
    expect(jan!.totalRevenue).toBe(60_000_000);
    expect(jan!.totalExpenses).toBe(47_000_000); // 32 + 10 + 5
    expect(jan!.netProfit).toBe(13_000_000);
  });

  it('Yanvar pul oqimi: 50 mln + 55 mln = 105 mln', async () => {
    const [jan] = await cashFlowByMonth(ctx.db, ['2026-01']);
    expect(jan!.opening).toBe(50_000_000);
    expect(jan!.operating).toBe(55_000_000); // +100 − 30 − 10 − 5
    expect(jan!.netChange).toBe(55_000_000);
    expect(jan!.closing).toBe(105_000_000);
  });

  it("31-yanvar balans: pul 105, oldindan to'lov 40, ish haqi qarzi 32", async () => {
    const bs = await balanceSheet(ctx.db, monthEnd('2026-01'));
    const cash = bs.assets
      .filter((l) => CASH_CODES.includes(l.code))
      .reduce((s, l) => s + l.amount, 0);
    expect(cash).toBe(105_000_000);
    expect(bs.liabilities.find((l) => l.code === ACCOUNTS.OLDINDAN_TOLOV.code)?.amount).toBe(40_000_000);
    expect(bs.liabilities.find((l) => l.code === ACCOUNTS.ISH_HAQI_QARZI.code)?.amount).toBe(32_000_000);
    expect(bs.imbalance).toBe(0);
  });

  it("ko'prik: foyda 13 + oldindan 40 + hisoblangan 32 − dekabr 30 = 55", async () => {
    const [jan] = await pnlByMonth(ctx.db, ['2026-01']);
    const [cf] = await cashFlowByMonth(ctx.db, ['2026-01']);
    const bridge = jan!.netProfit + 40_000_000 + 32_000_000 - 30_000_000;
    expect(bridge).toBe(cf!.netChange);
  });

  it("profitCashBridge servisi topshiriq jadvalini beradi", async () => {
    const bridge = await profitCashBridge(ctx.db, '2026-01');
    expect(bridge.netProfit).toBe(13_000_000);
    // Oldindan to'langan darslar: 0 → 40 mln (+40)
    expect(bridge.lines.find((l) => l.code === '2100')?.amount).toBe(40_000_000);
    // To'lanmagan ish haqi: 30 mln (dekabr) → 32 mln (yanvar) = +2
    // ya'ni "+32 hisoblandi − 30 to'landi" jadvaldagi ikki qatorning yig'indisi
    expect(bridge.lines.find((l) => l.code === '2200')?.amount).toBe(2_000_000);
    expect(bridge.total).toBe(55_000_000);
    expect(bridge.cashChange).toBe(55_000_000);
    expect(bridge.matches).toBe(true);
  });
});

/**
 * 2.2-jadval, inkassatsiya qatori: "Ta'sir yo'q / Ta'sir yo'q /
 * bir aktivdan ikkinchisiga". Eng ko'p xato qilinadigan nuqtalardan biri.
 */
describe('2.2-jadval: inkassatsiya hech qaysi oqimga tushmaydi', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestDb();
    // Kassaga 500 000 naqd tushdi, oy oxirida 400 000 bankka topshirildi
    await studentPayment(ctx.db, {
      date: utcDate(2026, 1, 4),
      amount: 500_000,
      method: 'cash',
      allocations: [{ month: '2026-01', amount: 500_000 }],
    });
    await cashTransfer(ctx.db, { date: utcDate(2026, 1, 31), amount: 400_000 });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it("P&L ga ta'sir yo'q", async () => {
    const [jan] = await pnlByMonth(ctx.db, ['2026-01']);
    expect(jan!.totalExpenses).toBe(0);
  });

  it("pul oqimiga ta'sir yo'q (faqat to'lovning 500 000 i ko'rinadi)", async () => {
    const [jan] = await cashFlowByMonth(ctx.db, ['2026-01']);
    expect(jan!.operating).toBe(500_000);
    expect(jan!.investing).toBe(0);
    expect(jan!.financing).toBe(0);
    expect(jan!.netChange).toBe(500_000);
  });

  it('balans: bir aktivdan ikkinchisiga (kassa 100 000, bank 400 000)', async () => {
    const bs = await balanceSheet(ctx.db, monthEnd('2026-01'));
    expect(bs.assets.find((l) => l.code === ACCOUNTS.KASSA.code)?.amount).toBe(100_000);
    expect(bs.assets.find((l) => l.code === ACCOUNTS.BANK.code)?.amount).toBe(400_000);
    expect(bs.imbalance).toBe(0);
  });
});
