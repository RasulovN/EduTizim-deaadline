import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { monthEnd, utcDate } from '../domain/dates.js';
import {
  accrueSalaries,
  loanPayment,
  loanReceived,
  paySalaries,
  recognizeMonth,
  studentPayment,
} from '../services/postings.js';
import { balanceSheet, pnlByMonth } from '../services/reports.js';
import { setupTestDb, type TestContext } from './helpers.js';

/**
 * Idempotentlik: davr-yopish operatsiyalari ikki marta chaqirilsa
 * raqamlar ikki baravar bo'lib ketmasligi kerak.
 */
describe('Idempotentlik: oy yopilishi takrorlanmaydi', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestDb();
    await studentPayment(ctx.db, {
      date: utcDate(2026, 1, 10),
      amount: 600_000,
      method: 'bank',
      allocations: [{ month: '2026-01', amount: 600_000 }],
    });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('daromad tan olish: ikkinchi chaqiruv hech narsa yozmaydi', async () => {
    const first = await recognizeMonth(ctx.db, '2026-01');
    expect(first).not.toBeNull();

    const second = await recognizeMonth(ctx.db, '2026-01');
    expect(second).toBeNull();

    const [jan] = await pnlByMonth(ctx.db, ['2026-01']);
    expect(jan!.totalRevenue).toBe(600_000); // 1 200 000 EMAS
  });

  it('ish haqi hisoblash: takror chaqiruv aniq xato bilan rad etiladi', async () => {
    await accrueSalaries(ctx.db, { month: '2026-01', amount: 8_000_000 });
    await expect(
      accrueSalaries(ctx.db, { month: '2026-01', amount: 8_000_000 }),
    ).rejects.toThrow(/allaqachon hisoblangan/);

    const [jan] = await pnlByMonth(ctx.db, ['2026-01']);
    const salary = jan!.expenses.find((e) => e.code === '5100');
    expect(salary?.amount).toBe(8_000_000); // 16 000 000 EMAS
  });
});

/**
 * Biznes validatsiya: buxgalteriy ma'nosiz holat yaratadigan
 * operatsiyalar aniq xato bilan rad etiladi.
 */
describe("Biznes validatsiya: noto'g'ri operatsiyalar rad etiladi", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestDb();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it("ish haqi: qoldiqdan ortiq to'lab bo'lmaydi", async () => {
    await accrueSalaries(ctx.db, { month: '2026-01', amount: 8_000_000 });

    await expect(
      paySalaries(ctx.db, { date: utcDate(2026, 2, 5), amount: 9_000_000, forMonth: '2026-01' }),
    ).rejects.toThrow(/qoldiqdan .* ortiq/);

    // To'g'ri summa esa o'tadi va qoldiq nolga tushadi
    await paySalaries(ctx.db, { date: utcDate(2026, 2, 5), amount: 8_000_000, forMonth: '2026-01' });
    const bs = await balanceSheet(ctx.db, monthEnd('2026-02'));
    expect(bs.liabilities.find((l) => l.code === '2200')?.amount ?? 0).toBe(0);

    // Endi qoldiq 0 — yana to'lash rad etiladi
    await expect(
      paySalaries(ctx.db, { date: utcDate(2026, 2, 6), amount: 1, forMonth: '2026-01' }),
    ).rejects.toThrow(/qoldiqdan .* ortiq/);
  });

  it("kredit: qoldiqdan ortiq asosiy qarz to'lab bo'lmaydi, foiz 0 mumkin", async () => {
    await loanReceived(ctx.db, { date: utcDate(2026, 3, 1), amount: 10_000_000 });

    await expect(
      loanPayment(ctx.db, { date: utcDate(2026, 3, 20), principal: 11_000_000, interest: 0 }),
    ).rejects.toThrow(/qoldig'idan .* ortiq/);

    // Foizsiz, faqat asosiy qarz — ruxsat etiladi
    await loanPayment(ctx.db, { date: utcDate(2026, 3, 20), principal: 10_000_000, interest: 0 });
    const bs = await balanceSheet(ctx.db, monthEnd('2026-03'));
    expect(bs.liabilities.find((l) => l.code === '2300')?.amount ?? 0).toBe(0);

    // Kredit yopilgan — yana to'lash rad etiladi
    await expect(
      loanPayment(ctx.db, { date: utcDate(2026, 4, 20), principal: 1, interest: 0 }),
    ).rejects.toThrow(/qoldig'idan .* ortiq/);
  });

  it("kredit: nol summali va manfiy to'lovlar rad etiladi", async () => {
    await expect(
      loanPayment(ctx.db, { date: utcDate(2026, 5, 20), principal: 0, interest: 0 }),
    ).rejects.toThrow(/nol bo'lishi mumkin emas/);
    await expect(
      loanPayment(ctx.db, { date: utcDate(2026, 5, 20), principal: -5, interest: 0 }),
    ).rejects.toThrow(/butun son/);
  });

  it("to'lov taqsimoti: noto'g'ri oy formati rad etiladi", async () => {
    await expect(
      studentPayment(ctx.db, {
        date: utcDate(2026, 1, 10),
        amount: 600_000,
        method: 'bank',
        allocations: [{ month: '2026-13', amount: 600_000 }],
      }),
    ).rejects.toThrow(/noto'g'ri formatda/);
  });

  it("to'lov taqsimoti: nol/manfiy summa rad etiladi", async () => {
    await expect(
      studentPayment(ctx.db, {
        date: utcDate(2026, 1, 10),
        amount: 600_000,
        method: 'bank',
        allocations: [
          { month: '2026-01', amount: 600_000 },
          { month: '2026-02', amount: 0 },
        ],
      }),
    ).rejects.toThrow(/musbat butun son/);
  });

  it("to'lov taqsimoti: yig'indi to'lovga teng bo'lmasa rad etiladi", async () => {
    await expect(
      studentPayment(ctx.db, {
        date: utcDate(2026, 1, 10),
        amount: 600_000,
        method: 'bank',
        allocations: [{ month: '2026-01', amount: 500_000 }],
      }),
    ).rejects.toThrow(/mos emas/);
  });
});
