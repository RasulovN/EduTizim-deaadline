import type { Db } from 'mongodb';
import { journalEntries } from '../models/journal-entry.model.js';
import { accountOrThrow } from './accounts.js';
import { monthKeyOf } from './dates.js';
import type { EntryLine, JournalEntry } from './types.js';

/**
 * Ledger — jurnal yozuvlarini joylashtirish (posting) qatlami.
 *
 * Invariantlar shu yerda majburlanadi va ular butun tizimning
 * to'g'riligini kafolatlaydi:
 *   1. Har bir yozuvda Σ(debet) === Σ(kredit) — aniq nol farq bilan.
 *   2. Har bir summa — musbat butun so'm (float yo'q).
 *   3. Har bir qator faqat bitta tomonda (debet YOKI kredit).
 *   4. Faqat hisoblar rejasida mavjud hisoblar ishlatiladi.
 *
 * Shu invariantlar tufayli Balans tenglamasi (Aktiv = Majburiyat + Kapital)
 * matematik jihatdan har doim bajarilishga majbur bo'ladi.
 */

function assertInteger(n: number, label: string): void {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`${label}: summa manfiy bo'lmagan butun son bo'lishi shart, berildi: ${n}`);
  }
}

export function validateLines(lines: EntryLine[]): void {
  if (lines.length < 2) {
    throw new Error("Jurnal yozuvida kamida 2 ta qator bo'lishi kerak");
  }
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    accountOrThrow(line.account);
    assertInteger(line.debit, `Hisob ${line.account} debet`);
    assertInteger(line.credit, `Hisob ${line.account} kredit`);
    const hasDebit = line.debit > 0;
    const hasCredit = line.credit > 0;
    if (hasDebit === hasCredit) {
      throw new Error(
        `Hisob ${line.account}: qator faqat bitta tomonda bo'lishi kerak (debet YOKI kredit, nolga teng emas)`,
      );
    }
    totalDebit += line.debit;
    totalCredit += line.credit;
  }
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Yozuv balanslanmagan: debet ${totalDebit} !== kredit ${totalCredit}`,
    );
  }
}

export type NewEntry = Omit<JournalEntry, '_id' | 'month'>;

export function validateEntry(entry: NewEntry): void {
  validateLines(entry.lines);

  if (entry.kind === 'student_payment') {
    const allocs = entry.allocations ?? [];
    if (allocs.length === 0) {
      throw new Error("O'quvchi to'lovida allocations (qaysi oylar uchun) ko'rsatilishi shart");
    }
    const allocTotal = allocs.reduce((s, a) => s + a.amount, 0);
    const paid = entry.lines.reduce((s, l) => s + l.debit, 0);
    if (allocTotal !== paid) {
      throw new Error(
        `To'lov taqsimoti mos emas: to'lov ${paid}, taqsimot ${allocTotal}`,
      );
    }
  }
}

export async function postEntry(db: Db, entry: NewEntry): Promise<JournalEntry> {
  validateEntry(entry);
  const doc: JournalEntry = { ...entry, month: monthKeyOf(entry.date) };
  await journalEntries(db).insertOne(doc);
  return doc;
}

/** Seed uchun: bir xil qat'iy validatsiya bilan ommaviy joylash */
export async function postMany(db: Db, entries: NewEntry[]): Promise<number> {
  if (entries.length === 0) return 0;
  const docs: JournalEntry[] = entries.map((e) => {
    validateEntry(e);
    return { ...e, month: monthKeyOf(e.date) };
  });
  const res = await journalEntries(db).insertMany(docs);
  return res.insertedCount;
}
