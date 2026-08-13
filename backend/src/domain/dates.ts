/**
 * Sana yordamchilari. Hammasi UTC — timezone tufayli oy chegarasi
 * siljib ketmasligi uchun barcha sanalar UTC da saqlanadi va
 * oy kaliti ('YYYY-MM') UTC bo'yicha hisoblanadi.
 */

/** UTC sana yaratish (kun o'rtasi — chegara xatolaridan qochish uchun) */
export function utcDate(year: number, month1: number, day: number, hour = 12): Date {
  return new Date(Date.UTC(year, month1 - 1, day, hour, 0, 0, 0));
}

/** 'YYYY-MM' oy kaliti */
export function monthKeyOf(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Noto'g'ri oy formati: ${key} (kutilgan: YYYY-MM)`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** Oyning oxirgi kuni, 23:59:59.999 UTC — "shu oy holatiga" so'rovlar uchun */
export function monthEnd(key: string): Date {
  const { year, month } = parseMonthKey(key);
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

/** Oyning oxirgi kuni (sana raqami) */
export function lastDayOfMonth(key: string): number {
  const { year, month } = parseMonthKey(key);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addMonths(key: string, n: number): string {
  const { year, month } = parseMonthKey(key);
  const d = new Date(Date.UTC(year, month - 1 + n, 1));
  return monthKeyOf(d);
}

/** [from..to] oraliqdagi barcha oy kalitlari */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

/** Kun oxiri (23:59:59.999 UTC) */
export function endOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  );
}

/** Topshiriq qoidasi: ish haqi keyingi oyning 5-sanasida to'lanadi */
export const SALARY_PAYMENT_DAY = 5;

/**
 * Berilgan oyda hisoblangan ish haqi QACHON to'lanadi — keyingi oyning
 * 5-sanasi. Masalan: '2026-01' → 2026-02-05, '2026-12' → 2027-01-05.
 * (Soat 10:00 UTC — seed'dagi kun ichi hodisalar tartibi saqlanishi uchun.)
 */
export function salaryPaymentDateFor(month: string): Date {
  const next = parseMonthKey(addMonths(month, 1));
  return utcDate(next.year, next.month, SALARY_PAYMENT_DAY, 10);
}
