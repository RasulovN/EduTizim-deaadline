/**
 * Hisoblar rejasi (Chart of Accounts).
 *
 * Model: klassik ikki tomonlama yozuv (double-entry).
 * Har bir hisob turi balansda qayerda turishini (`type`) va
 * pul harakati qarshisida turganda pul oqimining qaysi toifasiga
 * tushishini (`cf`) o'zi bilan olib yuradi.
 *
 * `cf` — pul oqimi klassifikatsiyasining kaliti: kassaga/bankka
 * tegadigan har bir provodkada pulning "qarshi tomoni" qaysi hisob
 * bo'lsa, o'sha hisobning `cf` toifasi pul oqimiga yoziladi.
 * Shu bilan aralash provodkalar (masalan, kredit to'lovi: asosiy
 * qarz = moliyaviy, foiz = operatsion) avtomatik to'g'ri bo'linadi.
 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type CashFlowCategory = 'operating' | 'investing' | 'financing';

export interface AccountDef {
  code: string;
  name: string;
  type: AccountType;
  /** Pul va pul ekvivalenti hisobmi (kassa, bank) */
  isCash?: boolean;
  /** Pul harakatining qarshi tomoni sifatida — pul oqimi toifasi */
  cf?: CashFlowCategory;
}

export const ACCOUNTS = {
  KASSA: { code: '1000', name: 'Kassa (naqd pul)', type: 'asset', isCash: true },
  BANK: { code: '1100', name: 'Bank hisobi', type: 'asset', isCash: true },
  ASOSIY_VOSITALAR: { code: '1500', name: 'Asosiy vositalar', type: 'asset', cf: 'investing' },

  OLDINDAN_TOLOV: { code: '2100', name: "Oldindan to'langan darslar", type: 'liability', cf: 'operating' },
  ISH_HAQI_QARZI: { code: '2200', name: "To'lanmagan ish haqi", type: 'liability', cf: 'operating' },
  BANK_KREDITI: { code: '2300', name: 'Bank krediti (asosiy qarz)', type: 'liability', cf: 'financing' },

  KAPITAL: { code: '3100', name: 'Kiritilgan kapital', type: 'equity', cf: 'financing' },

  KURS_DAROMADI: { code: '4000', name: 'Kurs daromadi', type: 'revenue', cf: 'operating' },

  ISH_HAQI_XARAJATI: { code: '5100', name: 'Ish haqi xarajati', type: 'expense', cf: 'operating' },
  IJARA: { code: '5200', name: 'Ijara xarajati', type: 'expense', cf: 'operating' },
  KOMMUNAL: { code: '5300', name: 'Kommunal xarajatlar', type: 'expense', cf: 'operating' },
  MARKETING: { code: '5400', name: 'Marketing xarajatlari', type: 'expense', cf: 'operating' },
  KREDIT_FOIZI: { code: '5500', name: 'Kredit foizi xarajati', type: 'expense', cf: 'operating' },
} as const satisfies Record<string, AccountDef>;

export type AccountKey = keyof typeof ACCOUNTS;

/** code → AccountDef lug'ati */
export const ACCOUNT_BY_CODE: ReadonlyMap<string, AccountDef> = new Map(
  Object.values(ACCOUNTS).map((a) => [a.code, a]),
);

export const CASH_CODES: string[] = Object.values(ACCOUNTS)
  .filter((a) => (a as AccountDef).isCash)
  .map((a) => a.code);

export const PNL_CODES: string[] = Object.values(ACCOUNTS)
  .filter((a) => a.type === 'revenue' || a.type === 'expense')
  .map((a) => a.code);

export function accountOrThrow(code: string): AccountDef {
  const acc = ACCOUNT_BY_CODE.get(code);
  if (!acc) throw new Error(`Noma'lum hisob kodi: ${code}`);
  return acc;
}
