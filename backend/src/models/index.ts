import type { Db } from 'mongodb';
import { ensureEmployeeIndexes } from './employee.model.js';
import { ensureJournalEntryIndexes } from './journal-entry.model.js';
import { ensureStudentIndexes } from './student.model.js';

export * from './journal-entry.model.js';
export * from './student.model.js';
export * from './employee.model.js';

export async function ensureAllIndexes(db: Db): Promise<void> {
  await Promise.all([
    ensureJournalEntryIndexes(db),
    ensureStudentIndexes(db),
    ensureEmployeeIndexes(db),
  ]);
}
