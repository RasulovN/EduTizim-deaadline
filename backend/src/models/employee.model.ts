import type { Collection, Db } from 'mongodb';

/**
 * Employee modeli — ish haqi hisoblash konteksti uchun.
 */

export interface Employee {
  _id: string;
  name: string;
  salary: number; // oylik, so'm
  startMonth: string; // 'YYYY-MM'
}

export const EMPLOYEES = 'employees';

export function employees(db: Db): Collection<Employee> {
  return db.collection<Employee>(EMPLOYEES);
}

export async function ensureEmployeeIndexes(db: Db): Promise<void> {
  await employees(db).createIndexes([{ key: { startMonth: 1 } }]);
}
