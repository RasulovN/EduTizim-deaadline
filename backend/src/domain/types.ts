import type { ObjectId } from 'mongodb';

/** Biznes hodisa turlari — audit va tahlil uchun */
export type EntryKind =
  | 'student_payment'
  | 'revenue_recognition'
  | 'salary_accrual'
  | 'salary_payment'
  | 'expense_payment'
  | 'capital_injection'
  | 'loan_received'
  | 'loan_payment'
  | 'equipment_purchase'
  | 'cash_transfer';

/** Bitta provodka qatori. Summalar — butun so'm (integer). */
export interface EntryLine {
  account: string;
  debit: number;
  credit: number;
}

/** O'quvchi to'lovining qaysi oylarga tegishliligi */
export interface Allocation {
  month: string; // 'YYYY-MM'
  amount: number;
}

/** Jurnal yozuvi — tizimdagi yagona haqiqat manbai (source of truth) */
export interface JournalEntry {
  _id?: ObjectId;
  date: Date;
  /** 'YYYY-MM' — date dan UTC bo'yicha; oy bo'yicha guruhlash va indeks uchun */
  month: string;
  kind: EntryKind;
  memo: string;
  lines: EntryLine[];
  /** faqat kind='student_payment' uchun: to'lov qaysi oylarni qoplaydi */
  allocations?: Allocation[];
  meta?: Record<string, unknown>;
}
