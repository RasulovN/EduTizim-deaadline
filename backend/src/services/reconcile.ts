import type { Db } from 'mongodb';
import { monthEnd } from '../domain/dates.js';
import {
  balanceSheet,
  cashBalanceAsOf,
  cashFlowByMonth,
  listMonths,
  pnlByMonth,
  prevMonthEnd,
  retainedEarningsAsOf,
} from './reports.js';

/**
 * Uchta tenglik — har bir oy uchun, aniq nol farq bilan.
 *
 * Har bir tenglikning ikki tomoni MUSTAQIL hisoblash yo'lidan olinadi:
 *   1. Balans: Aktivlar = Majburiyatlar + Kapital
 *      (balans pipeline'i, hisob turlari bo'yicha yig'ish)
 *   2. Pul oqimi: ochilish + (op + inv + fin) = yopilish
 *      (toifalar qarshi-tomon qatorlaridan, qoldiqlar pul qatorlaridan)
 *   3. Foyda: oy sof foydasi (P&L pipeline) = taqsimlanmagan foyda o'zgarishi
 *      (balans pipeline)
 */

export interface EquationResult {
  name: string;
  checked: number;
  mismatched: number;
  totalAbsDiff: number;
  failures: { month: string; diff: number }[];
}

export interface ReconcileResult {
  months: number;
  equations: EquationResult[];
  ok: boolean;
}

export async function reconcile(db: Db): Promise<ReconcileResult> {
  const months = await listMonths(db);

  const eq1: EquationResult = { name: 'Balans: Aktivlar = Majburiyatlar + Kapital', checked: 0, mismatched: 0, totalAbsDiff: 0, failures: [] };
  const eq2: EquationResult = { name: "Pul oqimi: ochilish + (op+inv+fin) = yopilish", checked: 0, mismatched: 0, totalAbsDiff: 0, failures: [] };
  const eq3: EquationResult = { name: "Foyda: sof foyda = taqsimlanmagan foyda o'zgarishi", checked: 0, mismatched: 0, totalAbsDiff: 0, failures: [] };

  const pnl = await pnlByMonth(db, months);
  const cf = await cashFlowByMonth(db, months);
  const pnlMap = new Map(pnl.map((r) => [r.month, r]));
  const cfMap = new Map(cf.map((r) => [r.month, r]));

  for (const month of months) {
    const eom = monthEnd(month);
    const som = prevMonthEnd(month);

    // 1) Balans tenglamasi
    const bs = await balanceSheet(db, eom);
    record(eq1, month, bs.imbalance);

    // 2) Pul oqimi bog'lanishi — qoldiqlar balans yo'lidan, oqimlar CF yo'lidan
    const cashOpen = await cashBalanceAsOf(db, som);
    const cashClose = await cashBalanceAsOf(db, eom);
    const flow = cfMap.get(month);
    const net = flow ? flow.operating + flow.investing + flow.financing : 0;
    record(eq2, month, cashOpen + net - cashClose);

    // 3) Foyda bog'lanishi
    const netProfit = pnlMap.get(month)?.netProfit ?? 0;
    const reOpen = await retainedEarningsAsOf(db, som);
    const reClose = await retainedEarningsAsOf(db, eom);
    record(eq3, month, netProfit - (reClose - reOpen));
  }

  const equations = [eq1, eq2, eq3];
  return {
    months: months.length,
    equations,
    ok: equations.every((e) => e.mismatched === 0),
  };
}

function record(eq: EquationResult, month: string, diff: number): void {
  eq.checked += 1;
  if (diff !== 0) {
    eq.mismatched += 1;
    eq.totalAbsDiff += Math.abs(diff);
    eq.failures.push({ month, diff });
  }
}
