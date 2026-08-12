import { describe, expect, it } from 'vitest';
import { validateLines } from '../domain/ledger.js';

/**
 * Ledger invariantlari — uchala tenglikning poydevori.
 * Balanslanmagan yoki kasr summali yozuv umuman bazaga tushmasligi kerak.
 */
describe('Ledger invariantlari', () => {
  it('debet ≠ kredit bo‘lsa rad etiladi', () => {
    expect(() =>
      validateLines([
        { account: '1100', debit: 100, credit: 0 },
        { account: '4000', debit: 0, credit: 99 },
      ]),
    ).toThrow(/balanslanmagan/i);
  });

  it('kasr (float) summa rad etiladi', () => {
    expect(() =>
      validateLines([
        { account: '1100', debit: 100.5, credit: 0 },
        { account: '4000', debit: 0, credit: 100.5 },
      ]),
    ).toThrow(/butun son/i);
  });

  it('manfiy summa rad etiladi', () => {
    expect(() =>
      validateLines([
        { account: '1100', debit: -100, credit: 0 },
        { account: '4000', debit: 0, credit: -100 },
      ]),
    ).toThrow(/butun son/i);
  });

  it("noma'lum hisob kodi rad etiladi", () => {
    expect(() =>
      validateLines([
        { account: '9999', debit: 100, credit: 0 },
        { account: '4000', debit: 0, credit: 100 },
      ]),
    ).toThrow(/Noma'lum hisob/i);
  });

  it('bitta qatorda ham debet, ham kredit taqiqlanadi', () => {
    expect(() =>
      validateLines([
        { account: '1100', debit: 100, credit: 100 },
        { account: '4000', debit: 100, credit: 100 },
      ]),
    ).toThrow(/bitta tomonda/i);
  });
});
