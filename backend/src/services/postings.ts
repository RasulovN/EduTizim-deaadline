import type { Db } from 'mongodb';
import { ACCOUNTS } from '../domain/accounts.js';
import { lastDayOfMonth, monthEnd, parseMonthKey, utcDate } from '../domain/dates.js';
import { postEntry, type NewEntry } from '../domain/ledger.js';
import { COLLECTIONS, type Allocation, type JournalEntry } from '../domain/types.js';

/**
 * Biznes hodisalar → jurnal yozuvlari.
 *
 * Har bir funksiya 2-bo'limdagi jadvalning bitta qatorini amalga oshiradi.
 * Hisobotlar bu funksiyalarni bilmaydi — ular faqat jurnal yozuvlarini o'qiydi.
 */

export type CashMethod = 'cash' | 'bank';

const cashCode = (m: CashMethod) => (m === 'cash' ? ACCOUNTS.KASSA.code : ACCOUNTS.BANK.code);

export interface StudentPaymentParams {
  date: Date;
  amount: number;
  method: CashMethod;
  allocations: Allocation[];
  studentId?: string;
  memo?: string;
}

/** O'quvchi to'lovi yozuvini qurish (seed bulk-insert ham shundan foydalanadi) */
export function buildStudentPayment(p: StudentPaymentParams): NewEntry {
  return {
    date: p.date,
    kind: 'student_payment',
    memo: p.memo ?? `O'quvchi to'lovi (${p.allocations.map((a) => a.month).join(', ')})`,
    lines: [
      { account: cashCode(p.method), debit: p.amount, credit: 0 },
      { account: ACCOUNTS.OLDINDAN_TOLOV.code, debit: 0, credit: p.amount },
    ],
    allocations: p.allocations,
    meta: p.studentId ? { studentId: p.studentId } : undefined,
  };
}

/** O'quvchi to'lovi: Pul ↑, "Oldindan to'langan darslar" majburiyati ↑. Daromad EMAS. */
export async function studentPayment(db: Db, p: StudentPaymentParams): Promise<JournalEntry> {
  return postEntry(db, buildStudentPayment(p));
}

/**
 * Oy yopilishi: shu oy uchun to'langan summalar daromadga aylanadi.
 * Majburiyat ↓, Daromad ↑. Pulga ta'sir yo'q.
 *
 * Faqat oy oxirigacha AMALDA to'langan summalar tan olinadi —
 * shuning uchun manba sifatida to'lov yozuvlarining allocations
 * maydonlari agregatsiya qilinadi.
 */
export async function recognizeMonth(db: Db, month: string): Promise<JournalEntry | null> {
  const cutoff = monthEnd(month);
  const [row] = await db
    .collection<JournalEntry>(COLLECTIONS.ENTRIES)
    .aggregate<{ total: number; count: number }>([
      { $match: { kind: 'student_payment', date: { $lte: cutoff }, 'allocations.month': month } },
      { $unwind: '$allocations' },
      { $match: { 'allocations.month': month } },
      { $group: { _id: null, total: { $sum: '$allocations.amount' }, count: { $sum: 1 } } },
    ])
    .toArray();

  if (!row || row.total === 0) return null;

  const { year, month: m } = parseMonthKey(month);
  return postEntry(db, {
    date: utcDate(year, m, lastDayOfMonth(month), 18),
    kind: 'revenue_recognition',
    memo: `${month}: darslar o'tildi — daromad tan olindi (${row.count} ta to'lovdan)`,
    lines: [
      { account: ACCOUNTS.OLDINDAN_TOLOV.code, debit: row.total, credit: 0 },
      { account: ACCOUNTS.KURS_DAROMADI.code, debit: 0, credit: row.total },
    ],
  });
}

/** Oy yopilishi: ish haqi hisoblanadi. Xarajat ↑, Majburiyat ↑. Pulga ta'sir yo'q. */
export async function accrueSalaries(
  db: Db,
  p: { month: string; amount: number; meta?: Record<string, unknown> },
): Promise<JournalEntry> {
  const { year, month: m } = parseMonthKey(p.month);
  return postEntry(db, {
    date: utcDate(year, m, lastDayOfMonth(p.month), 18),
    kind: 'salary_accrual',
    memo: `${p.month}: ish haqi hisoblandi (to'lov keyingi oyning 5-sanasida)`,
    lines: [
      { account: ACCOUNTS.ISH_HAQI_XARAJATI.code, debit: p.amount, credit: 0 },
      { account: ACCOUNTS.ISH_HAQI_QARZI.code, debit: 0, credit: p.amount },
    ],
    meta: p.meta,
  });
}

/** Ish haqi to'lovi: Majburiyat ↓, Pul ↓. Xarajat EMAS (u allaqachon hisoblangan). */
export async function paySalaries(
  db: Db,
  p: { date: Date; amount: number; method?: CashMethod; forMonth: string },
): Promise<JournalEntry> {
  return postEntry(db, {
    date: p.date,
    kind: 'salary_payment',
    memo: `${p.forMonth} oyi uchun ish haqi to'landi`,
    lines: [
      { account: ACCOUNTS.ISH_HAQI_QARZI.code, debit: p.amount, credit: 0 },
      { account: cashCode(p.method ?? 'bank'), debit: 0, credit: p.amount },
    ],
    meta: { forMonth: p.forMonth },
  });
}

export type ExpenseKind = 'ijara' | 'kommunal' | 'marketing';

const EXPENSE_ACCOUNT: Record<ExpenseKind, string> = {
  ijara: ACCOUNTS.IJARA.code,
  kommunal: ACCOUNTS.KOMMUNAL.code,
  marketing: ACCOUNTS.MARKETING.code,
};

/** Ijara / kommunal / marketing: to'lov paytida xarajat. Xarajat ↑, Pul ↓. */
export async function payExpense(
  db: Db,
  p: { date: Date; amount: number; expense: ExpenseKind; method?: CashMethod; memo?: string },
): Promise<JournalEntry> {
  return postEntry(db, {
    date: p.date,
    kind: 'expense_payment',
    memo: p.memo ?? `${p.expense} to'lovi`,
    lines: [
      { account: EXPENSE_ACCOUNT[p.expense], debit: p.amount, credit: 0 },
      { account: cashCode(p.method ?? 'bank'), debit: 0, credit: p.amount },
    ],
  });
}

/** Investor kapitali: Pul ↑, Kapital ↑. Daromad EMAS — moliyaviy kirim. */
export async function investorCapital(
  db: Db,
  p: { date: Date; amount: number; method?: CashMethod; investor?: string },
): Promise<JournalEntry> {
  return postEntry(db, {
    date: p.date,
    kind: 'capital_injection',
    memo: p.investor ? `Investor kapitali: ${p.investor}` : 'Investor kapitali',
    lines: [
      { account: cashCode(p.method ?? 'bank'), debit: p.amount, credit: 0 },
      { account: ACCOUNTS.KAPITAL.code, debit: 0, credit: p.amount },
    ],
    meta: p.investor ? { investor: p.investor } : undefined,
  });
}

/** Kredit olindi: Pul ↑, Qarz ↑. Daromad EMAS — moliyaviy kirim. */
export async function loanReceived(
  db: Db,
  p: { date: Date; amount: number; method?: CashMethod; memo?: string },
): Promise<JournalEntry> {
  return postEntry(db, {
    date: p.date,
    kind: 'loan_received',
    memo: p.memo ?? 'Bankdan kredit olindi',
    lines: [
      { account: cashCode(p.method ?? 'bank'), debit: p.amount, credit: 0 },
      { account: ACCOUNTS.BANK_KREDITI.code, debit: 0, credit: p.amount },
    ],
  });
}

/**
 * Kredit to'lovi — bitta yozuvda ikkiga bo'linadi:
 * asosiy qarz (moliyaviy chiqim, xarajat emas) + foiz (operatsion chiqim, xarajat).
 */
export async function loanPayment(
  db: Db,
  p: { date: Date; principal: number; interest: number; method?: CashMethod },
): Promise<JournalEntry> {
  return postEntry(db, {
    date: p.date,
    kind: 'loan_payment',
    memo: `Kredit to'lovi: asosiy qarz ${p.principal}, foiz ${p.interest}`,
    lines: [
      { account: ACCOUNTS.BANK_KREDITI.code, debit: p.principal, credit: 0 },
      { account: ACCOUNTS.KREDIT_FOIZI.code, debit: p.interest, credit: 0 },
      { account: cashCode(p.method ?? 'bank'), debit: 0, credit: p.principal + p.interest },
    ],
  });
}

/** Jihoz xaridi: Pul ↓, Aktiv ↑. Xarajat EMAS — investitsion chiqim. */
export async function equipmentPurchase(
  db: Db,
  p: { date: Date; amount: number; method?: CashMethod; memo?: string },
): Promise<JournalEntry> {
  return postEntry(db, {
    date: p.date,
    kind: 'equipment_purchase',
    memo: p.memo ?? 'Jihoz sotib olindi',
    lines: [
      { account: ACCOUNTS.ASOSIY_VOSITALAR.code, debit: p.amount, credit: 0 },
      { account: cashCode(p.method ?? 'bank'), debit: 0, credit: p.amount },
    ],
  });
}

/** Inkassatsiya: kassadan bankka. Xarajat ham, pul oqimi ham EMAS. */
export async function cashTransfer(
  db: Db,
  p: { date: Date; amount: number; from?: CashMethod; to?: CashMethod },
): Promise<JournalEntry> {
  const from = p.from ?? 'cash';
  const to = p.to ?? 'bank';
  return postEntry(db, {
    date: p.date,
    kind: 'cash_transfer',
    memo: 'Inkassatsiya: kassadan bankka',
    lines: [
      { account: cashCode(to), debit: p.amount, credit: 0 },
      { account: cashCode(from), debit: 0, credit: p.amount },
    ],
  });
}
