import type { Collection, Db } from 'mongodb';

/**
 * Student modeli — CRM konteksti uchun (hisobotlar bunga bog'liq emas,
 * moliyaviy haqiqat faqat journal_entries da).
 */

export interface Student {
  _id: string;
  name: string;
  startMonth: string; // 'YYYY-MM'
  endMonth: string;
  listFee: number; // chegirmasiz oylik narx (so'm)
  discountPct: number;
  fee: number; // chegirmadan keyingi oylik to'lov (so'm)
  payer: 'monthly' | 'prepay3';
  method: 'cash' | 'bank';
}

export const STUDENTS = 'students';

export function students(db: Db): Collection<Student> {
  return db.collection<Student>(STUDENTS);
}

export async function ensureStudentIndexes(db: Db): Promise<void> {
  await students(db).createIndexes([{ key: { startMonth: 1 } }]);
}
