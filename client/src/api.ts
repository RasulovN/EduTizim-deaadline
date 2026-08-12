/** Backend API tiplari va fetch yordamchilari */

export interface Line {
  code: string;
  name: string;
  amount: number;
}

export interface PnlReport {
  month: string;
  revenue: Line[];
  expenses: Line[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

export type CfCategory = 'operating' | 'investing' | 'financing';

export interface CashFlowReport {
  month: string;
  opening: number;
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
  closing: number;
  detail: { category: CfCategory; code: string; name: string; amount: number }[];
}

export interface BalanceSheet {
  asOf: string;
  assets: Line[];
  liabilities: Line[];
  equity: Line[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  imbalance: number;
}

export interface MonthlyReports {
  month: string;
  pnl: PnlReport | null;
  cashflow: CashFlowReport | null;
  balance: BalanceSheet;
}

export interface ReconcileResult {
  months: number;
  ok: boolean;
  equations: { name: string; checked: number; mismatched: number; totalAbsDiff: number }[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API xatosi: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  months: () => getJson<{ months: string[] }>('/api/months'),
  monthly: (month: string) => getJson<MonthlyReports>(`/api/reports/monthly?month=${month}`),
  pnlAll: () => getJson<{ reports: PnlReport[] }>('/api/reports/pnl'),
  reconcile: () => getJson<ReconcileResult>('/api/reconcile'),
};
