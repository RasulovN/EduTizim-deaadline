/** Raqam va sana formatlash (o'zbekcha) */

const MONTH_NAMES = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
] as const;

/** '2026-07' → 'Iyul 2026' */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

/** 12345678 → '12 345 678' (minus: −) */
export function fmtSom(n: number): string {
  const sign = n < 0 ? '−' : '';
  return sign + Math.abs(n).toLocaleString('en-US').replace(/,/g, ' ');
}

/** Katta raqamlar uchun qisqa ko'rinish: 3 240 000 000 → '3.24 mlrd' */
export function fmtCompact(n: number): string {
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} mlrd`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} mln`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)} ming`;
  return sign + String(abs);
}
