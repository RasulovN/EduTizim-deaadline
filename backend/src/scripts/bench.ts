import { closeDb, connectDb } from '../db.js';
import { monthEnd } from '../domain/dates.js';
import { balanceSheet, cashFlowByMonth, listMonths, pnlByMonth } from '../services/reports.js';

/**
 * `npm run bench` — README dagi unumdorlik o'lchovlari shu skriptdan.
 * Har bir hisobot 5 marta chaqirilib, median vaqt chiqariladi.
 */

async function timeIt(label: string, fn: () => Promise<unknown>): Promise<void> {
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[2]!;
  console.log(`  ${label.padEnd(46)} median ${median.toFixed(1)} ms (min ${times[0]!.toFixed(1)}, max ${times[4]!.toFixed(1)})`);
}

async function main(): Promise<void> {
  const db = await connectDb();
  const months = await listMonths(db);
  if (months.length === 0) {
    console.error("Baza bo'sh — avval `npm run seed` ishga tushiring");
    process.exit(1);
  }
  const last = months[months.length - 1]!;
  const entries = await db.collection('journal_entries').countDocuments();

  console.log('');
  console.log(`BENCH — ${entries.toLocaleString('en-US')} jurnal yozuvi, ${months.length} oy`);
  console.log('');
  await timeIt(`P&L (bitta oy: ${last})`, () => pnlByMonth(db, [last]));
  await timeIt(`P&L (butun tarix, ${months.length} oy)`, () => pnlByMonth(db, months));
  await timeIt(`Pul oqimi (bitta oy: ${last})`, () => cashFlowByMonth(db, [last]));
  await timeIt(`Pul oqimi (butun tarix)`, () => cashFlowByMonth(db, months));
  await timeIt(`Balans (${last} oxiriga)`, () => balanceSheet(db, monthEnd(last)));
  console.log('');

  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
