import type { Db } from 'mongodb';
import {
  ACCOUNT_BY_CODE,
  ACCOUNTS,
  CASH_CODES,
  PNL_CODES,
  type CashFlowCategory,
} from '../domain/accounts.js';
import { monthEnd, addMonths } from '../domain/dates.js';
import { COLLECTIONS } from '../domain/types.js';

/**
 * Uchta hisobot — uchtasi ham faqat jurnal yozuvlaridan o'qiydi.
 *
 * Muhim dizayn qarori: har bir hisobot MUSTAQIL aggregation pipeline
 * orqali hisoblanadi. Reconcile ana shu mustaqil yo'llar bir-biriga
 * mos kelishini tekshiradi — bitta umumiy funksiyadan chiqarilsa,
 * tekshiruv o'z-o'zini tasdiqlagan bo'lar edi.
 */

const entriesCol = (db: Db) => db.collection(COLLECTIONS.ENTRIES);

// ───────────────────────────── Balans ─────────────────────────────

export interface BalanceLine {
  code: string;
  name: string;
  amount: number;
}

export interface BalanceSheet {
  asOf: string; // ISO sana
  assets: BalanceLine[];
  liabilities: BalanceLine[];
  equity: BalanceLine[]; // kiritilgan kapital + taqsimlanmagan foyda
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  /** Aktivlar − (Majburiyatlar + Kapital); to'g'ri tizimda doim 0 */
  imbalance: number;
}

/** Har bir hisob bo'yicha jami debet/kredit (berilgan sanagacha) */
async function accountSums(db: Db, asOf: Date): Promise<Map<string, { debit: number; credit: number }>> {
  const rows = await entriesCol(db)
    .aggregate<{ _id: string; debit: number; credit: number }>([
      { $match: { date: { $lte: asOf } } },
      { $unwind: '$lines' },
      {
        $group: {
          _id: '$lines.account',
          debit: { $sum: '$lines.debit' },
          credit: { $sum: '$lines.credit' },
        },
      },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id, { debit: r.debit, credit: r.credit }]));
}

export async function balanceSheet(db: Db, asOf: Date): Promise<BalanceSheet> {
  const sums = await accountSums(db, asOf);

  const assets: BalanceLine[] = [];
  const liabilities: BalanceLine[] = [];
  const equity: BalanceLine[] = [];
  let retainedEarnings = 0;

  for (const [code, s] of sums) {
    const acc = ACCOUNT_BY_CODE.get(code);
    if (!acc) throw new Error(`Bazada noma'lum hisob kodi: ${code}`);
    switch (acc.type) {
      case 'asset':
        assets.push({ code, name: acc.name, amount: s.debit - s.credit });
        break;
      case 'liability':
        liabilities.push({ code, name: acc.name, amount: s.credit - s.debit });
        break;
      case 'equity':
        equity.push({ code, name: acc.name, amount: s.credit - s.debit });
        break;
      case 'revenue':
        retainedEarnings += s.credit - s.debit;
        break;
      case 'expense':
        retainedEarnings -= s.debit - s.credit;
        break;
    }
  }

  // Daromad/xarajat hisoblari yakunda taqsimlanmagan foydaga "yopiladi".
  // Biz ularni yozuv sifatida ko'chirmaymiz — hisobot paytida yig'amiz.
  equity.push({ code: '3900', name: 'Taqsimlanmagan foyda', amount: retainedEarnings });

  const sortByCode = (a: BalanceLine, b: BalanceLine) => a.code.localeCompare(b.code);
  assets.sort(sortByCode);
  liabilities.sort(sortByCode);
  equity.sort(sortByCode);

  const totalAssets = assets.reduce((s, l) => s + l.amount, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0);
  const totalEquity = equity.reduce((s, l) => s + l.amount, 0);

  return {
    asOf: asOf.toISOString(),
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    imbalance: totalAssets - (totalLiabilities + totalEquity),
  };
}

// ─────────────────────────── Foyda va zarar ───────────────────────────

export interface PnlReport {
  month: string;
  revenue: BalanceLine[];
  expenses: BalanceLine[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

/** Bir yoki bir nechta oy uchun P&L (oylar kesimida) */
export async function pnlByMonth(db: Db, months?: string[]): Promise<PnlReport[]> {
  const match: Record<string, unknown> = { 'lines.account': { $in: PNL_CODES } };
  if (months) match.month = { $in: months };

  const rows = await entriesCol(db)
    .aggregate<{ _id: { month: string; account: string }; debit: number; credit: number }>([
      { $match: match },
      { $unwind: '$lines' },
      { $match: { 'lines.account': { $in: PNL_CODES } } },
      {
        $group: {
          _id: { month: '$month', account: '$lines.account' },
          debit: { $sum: '$lines.debit' },
          credit: { $sum: '$lines.credit' },
        },
      },
    ])
    .toArray();

  const byMonth = new Map<string, PnlReport>();
  const getMonth = (m: string): PnlReport => {
    let r = byMonth.get(m);
    if (!r) {
      r = { month: m, revenue: [], expenses: [], totalRevenue: 0, totalExpenses: 0, netProfit: 0 };
      byMonth.set(m, r);
    }
    return r;
  };
  // So'ralgan oylar bo'sh bo'lsa ham hisobotda nol qiymat bilan chiqsin
  for (const m of months ?? []) getMonth(m);

  for (const row of rows) {
    const acc = ACCOUNT_BY_CODE.get(row._id.account);
    if (!acc) throw new Error(`Noma'lum hisob: ${row._id.account}`);
    const rep = getMonth(row._id.month);
    if (acc.type === 'revenue') {
      const amount = row.credit - row.debit;
      rep.revenue.push({ code: acc.code, name: acc.name, amount });
      rep.totalRevenue += amount;
    } else {
      const amount = row.debit - row.credit;
      rep.expenses.push({ code: acc.code, name: acc.name, amount });
      rep.totalExpenses += amount;
    }
  }

  const reports = [...byMonth.values()];
  for (const r of reports) {
    r.revenue.sort((a, b) => a.code.localeCompare(b.code));
    r.expenses.sort((a, b) => a.code.localeCompare(b.code));
    r.netProfit = r.totalRevenue - r.totalExpenses;
  }
  reports.sort((a, b) => a.month.localeCompare(b.month));
  return reports;
}

// ───────────────────────────── Pul oqimi ─────────────────────────────

export interface CashFlowReport {
  month: string;
  opening: number;
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
  closing: number;
  /** toifa ichida hisoblar kesimida tafsilot */
  detail: { category: CashFlowCategory; code: string; name: string; amount: number }[];
}

/**
 * Pul oqimi klassifikatsiyasi: pul hisobiga tegadigan har bir yozuvda
 * pulning QARSHI TOMONI qaysi hisob bo'lsa, o'sha hisobning `cf`
 * toifasi ishlatiladi. Yozuv balanslangani uchun qarshi tomonlarning
 * (kredit − debet) yig'indisi ayni pul o'zgarishiga teng.
 * Kassadan bankka o'tkazmada qarshi tomon yo'q → hisobotga tushmaydi.
 */
export async function cashFlowByMonth(db: Db, months?: string[]): Promise<CashFlowReport[]> {
  // 1) Pul qoldig'ining oylik o'zgarishi — ochilish/yopilish uchun (tarix boshidan)
  const cashRows = await entriesCol(db)
    .aggregate<{ _id: string; delta: number }>([
      { $match: { 'lines.account': { $in: CASH_CODES } } },
      { $unwind: '$lines' },
      { $match: { 'lines.account': { $in: CASH_CODES } } },
      {
        $group: {
          _id: '$month',
          delta: { $sum: { $subtract: ['$lines.debit', '$lines.credit'] } },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  // 2) Toifalar: qarshi tomon qatorlari bo'yicha
  const counterRows = await entriesCol(db)
    .aggregate<{ _id: { month: string; account: string }; amount: number }>([
      { $match: { 'lines.account': { $in: CASH_CODES } } },
      { $unwind: '$lines' },
      { $match: { 'lines.account': { $nin: CASH_CODES } } },
      {
        $group: {
          _id: { month: '$month', account: '$lines.account' },
          amount: { $sum: { $subtract: ['$lines.credit', '$lines.debit'] } },
        },
      },
    ])
    .toArray();

  const allMonths = cashRows.map((r) => r._id);
  const wanted = months ? new Set(months) : null;

  const byMonth = new Map<string, CashFlowReport>();
  const getMonth = (m: string): CashFlowReport => {
    let r = byMonth.get(m);
    if (!r) {
      r = { month: m, opening: 0, operating: 0, investing: 0, financing: 0, netChange: 0, closing: 0, detail: [] };
      byMonth.set(m, r);
    }
    return r;
  };

  for (const row of counterRows) {
    const acc = ACCOUNT_BY_CODE.get(row._id.account);
    if (!acc) throw new Error(`Noma'lum hisob: ${row._id.account}`);
    if (!acc.cf) {
      throw new Error(
        `Hisob ${acc.code} (${acc.name}) pul harakati qarshisida, lekin pul oqimi toifasi yo'q`,
      );
    }
    const rep = getMonth(row._id.month);
    rep[acc.cf] += row.amount;
    rep.detail.push({ category: acc.cf, code: acc.code, name: acc.name, amount: row.amount });
  }

  // Ochilish/yopilish qoldiqlari — tarix boshidan yig'ib boriladi
  let running = 0;
  for (const m of allMonths) {
    const rep = getMonth(m);
    rep.opening = running;
    const cashDelta = cashRows.find((r) => r._id === m)?.delta ?? 0;
    running += cashDelta;
    rep.closing = running;
    rep.netChange = rep.operating + rep.investing + rep.financing;
  }

  let reports = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  if (wanted) {
    // So'ralgan, lekin hodisasiz oylar uchun ham qoldiqlarni to'g'ri ko'rsatish
    for (const m of wanted) {
      if (!byMonth.has(m)) {
        const prev = reports.filter((r) => r.month < m).at(-1);
        const bal = prev ? prev.closing : 0;
        const empty = getMonth(m);
        empty.opening = bal;
        empty.closing = bal;
      }
    }
    reports = [...byMonth.values()]
      .filter((r) => wanted.has(r.month))
      .sort((a, b) => a.month.localeCompare(b.month));
  }
  for (const r of reports) r.detail.sort((a, b) => a.code.localeCompare(b.code));
  return reports;
}

// ─────────────────────────── Yordamchilar ───────────────────────────

/** Bazadagi barcha oylar (tartiblangan) */
export async function listMonths(db: Db): Promise<string[]> {
  const months = await entriesCol(db).distinct('month');
  return (months as string[]).sort();
}

/** Pul qoldig'i (kassa + bank) berilgan sana holatiga — mustaqil yo'l */
export async function cashBalanceAsOf(db: Db, asOf: Date): Promise<number> {
  const [row] = await entriesCol(db)
    .aggregate<{ total: number }>([
      { $match: { date: { $lte: asOf }, 'lines.account': { $in: CASH_CODES } } },
      { $unwind: '$lines' },
      { $match: { 'lines.account': { $in: CASH_CODES } } },
      { $group: { _id: null, total: { $sum: { $subtract: ['$lines.debit', '$lines.credit'] } } } },
    ])
    .toArray();
  return row?.total ?? 0;
}

/** Taqsimlanmagan foyda berilgan sana holatiga (balans yo'li bilan) */
export async function retainedEarningsAsOf(db: Db, asOf: Date): Promise<number> {
  const bs = await balanceSheet(db, asOf);
  return bs.equity.find((l) => l.code === '3900')?.amount ?? 0;
}

/** Balansdan olingan "oldindan to'langan darslar" qoldig'i (test/tekshiruv uchun) */
export async function deferredRevenueAsOf(db: Db, asOf: Date): Promise<number> {
  const bs = await balanceSheet(db, asOf);
  return bs.liabilities.find((l) => l.code === ACCOUNTS.OLDINDAN_TOLOV.code)?.amount ?? 0;
}

export function prevMonthEnd(month: string): Date {
  return monthEnd(addMonths(month, -1));
}
