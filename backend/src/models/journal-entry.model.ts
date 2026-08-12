import type { Collection, Db } from 'mongodb';
import type { JournalEntry } from '../domain/types.js';

/**
 * JournalEntry modeli — jurnal yozuvlari kolleksiyasi.
 *
 * Bu tizimning YAGONA haqiqat manbai: uchala hisobot ham, reconcile ham
 * faqat shu kolleksiyadan o'qiydi. Yozish esa faqat domain/ledger.ts
 * orqali (invariantlar: Σdebet=Σkredit, butun so'm, mavjud hisoblar).
 *
 * Native driver + qat'iy TypeScript tiplar ataylab tanlangan (Mongoose emas):
 * ledger invariantlari sxema validatsiyasidan kuchliroq kafolat beradi,
 * hisobotlar esa sof aggregation pipeline — ODM qatlami bu yerda faqat
 * ortiqcha abstraksiya bo'lar edi. (README → "Ma'lumotlar modeli")
 */

export const JOURNAL_ENTRIES = 'journal_entries';

export function journalEntries(db: Db): Collection<JournalEntry> {
  return db.collection<JournalEntry>(JOURNAL_ENTRIES);
}

export async function ensureJournalEntryIndexes(db: Db): Promise<void> {
  await journalEntries(db).createIndexes([
    // balans: date <= asOf bo'yicha skanerlash
    { key: { date: 1 } },
    // P&L / Cash Flow: oy bo'yicha guruhlash
    { key: { month: 1 } },
    // pul/hisob qatorlari bo'yicha filtrlash + oy
    { key: { 'lines.account': 1, month: 1 } },
    // daromad tan olish: to'lov allocations agregatsiyasi
    { key: { kind: 1, 'allocations.month': 1 } },
  ]);
}
