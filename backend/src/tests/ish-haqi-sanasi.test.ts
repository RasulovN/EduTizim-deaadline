import { describe, expect, it } from 'vitest';
import { SALARY_PAYMENT_DAY, salaryPaymentDateFor, utcDate } from '../domain/dates.js';

/**
 * Topshiriq qoidasi: "5-sanada xodimlarga O'TGAN oy uchun ish haqi
 * to'lanadi". Yanvar ish haqi yanvarda hisoblanadi, 5-fevralda to'lanadi.
 * Sof funksiya — DB kerak emas.
 */
describe("salaryPaymentDateFor — keyingi oyning 5-sanasi", () => {
  const ymd = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

  it('yanvar ish haqi → 5-fevral', () => {
    expect(ymd(salaryPaymentDateFor('2026-01'))).toBe('2026-02-05');
  });

  it('fevral ish haqi → 5-mart', () => {
    expect(ymd(salaryPaymentDateFor('2026-02'))).toBe('2026-03-05');
  });

  it("dekabr ish haqi → KEYINGI YIL 5-yanvari (yil almashishi)", () => {
    expect(ymd(salaryPaymentDateFor('2026-12'))).toBe('2027-01-05');
  });

  it("seed'dagi eski ifoda bilan aynan bir xil timestamp (xatti-harakat o'zgarmagan)", () => {
    // Eski kod joriy oy (year, m) ichida utcDate(year, m, 5, 10) ishlatardi —
    // prevMonth uchun bu keyingi oyning 5-sanasi, soat 10:00 UTC.
    expect(salaryPaymentDateFor('2026-01').getTime()).toBe(utcDate(2026, 2, 5, 10).getTime());
    expect(salaryPaymentDateFor('2026-01').getUTCDate()).toBe(SALARY_PAYMENT_DAY);
  });
});
