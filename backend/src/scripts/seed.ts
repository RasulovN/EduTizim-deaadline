import type { Db } from 'mongodb';
import { closeDb, connectDb, ensureIndexes } from '../db.js';
import { addMonths, lastDayOfMonth, monthRange, parseMonthKey, utcDate } from '../domain/dates.js';
import { postMany, type NewEntry } from '../domain/ledger.js';
import { COLLECTIONS } from '../domain/types.js';
import {
  accrueSalaries,
  buildStudentPayment,
  cashTransfer,
  equipmentPurchase,
  investorCapital,
  loanPayment,
  loanReceived,
  payExpense,
  paySalaries,
  recognizeMonth,
  type CashMethod,
} from '../services/postings.js';

/**
 * `npm run seed` — 2-bo'limdagi biznes jarayonini 43 oy (2023-01 .. 2026-07)
 * davomida takrorlaydi:
 *   · 520 o'quvchi: chegirmali, 3 oylik oldindan to'lovchi, o'tkazib yuboruvchi
 *   · 22 xodim: ish haqi oy oxirida hisoblanadi, keyingi oy 5-sanasida to'lanadi
 *   · har oy ijara / kommunal / marketing, oy oxirida inkassatsiya
 *   · 2 investor (biri keyinroq qo'shimcha kapital kiritgan), 1 bank krediti,
 *     jihoz xaridlari
 *
 * Determinizm: seeded PRNG (mulberry32) — har safar bir xil ma'lumot,
 * shuning uchun reconcile natijasi ham barqaror.
 */

const FIRST_MONTH = '2023-01';
const LAST_MONTH = '2026-07';

// ── PRNG ──────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260813);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const chance = (p: number) => rand() < p;

// ── Ismlar ────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Aziz', 'Jasur', 'Bekzod', 'Sardor', 'Umid', 'Shohruh', 'Diyor', 'Otabek', 'Javlon', 'Nodir',
  'Malika', 'Nilufar', 'Zarina', 'Gulnora', 'Dilnoza', 'Sevara', 'Kamola', 'Madina', 'Shahzoda', 'Nargiza',
] as const;
const LAST_NAMES = [
  'Karimov', 'Toshmatov', 'Rahimov', 'Yusupov', 'Ergashev', 'Saidov', 'Mirzayev', 'Abdullayev',
  'Karimova', 'Toshmatova', 'Rahimova', 'Yusupova', 'Ergasheva', 'Saidova', 'Mirzayeva', 'Abdullayeva',
] as const;

// ── Modellar ──────────────────────────────────────────────────────────

interface SeedStudent {
  _id: string;
  name: string;
  startMonth: string;
  endMonth: string;
  listFee: number;
  discountPct: number;
  fee: number; // chegirmadan keyingi oylik to'lov
  payer: 'monthly' | 'prepay3';
  method: CashMethod;
}

interface SeedEmployee {
  _id: string;
  name: string;
  salary: number;
  startMonth: string;
}

function makeStudents(months: string[]): SeedStudent[] {
  const students: SeedStudent[] = [];
  const FEES = [400_000, 500_000, 600_000, 800_000, 1_000_000, 1_200_000] as const;
  for (let i = 0; i < 800; i++) {
    // 25% — markaz ochilgan choragida kelganlar, qolganlari 3.5 yil davomida
    // doimiy oqim bilan qo'shilib boradi (o'sib borayotgan markaz)
    const startIdx = chance(0.25) ? randInt(0, 3) : randInt(0, months.length - 2);
    const startMonth = months[startIdx]!;
    const duration = randInt(9, 36);
    const endIdx = Math.min(startIdx + duration - 1, months.length - 1);
    // ~15% kursni muddatidan oldin tashlab ketadi (kamida 2-3 oy o'qib)
    const realEndIdx = chance(0.15)
      ? randInt(Math.min(startIdx + 2, endIdx), endIdx)
      : endIdx;
    const listFee = pick(FEES);
    const discountPct = chance(0.2) ? pick([10, 15, 20, 25] as const) : 0;
    const fee = Math.round((listFee * (100 - discountPct)) / 100 / 1000) * 1000;
    students.push({
      _id: `st-${String(i + 1).padStart(4, '0')}`,
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      startMonth,
      endMonth: months[realEndIdx]!,
      listFee,
      discountPct,
      fee,
      payer: chance(0.25) ? 'prepay3' : 'monthly',
      method: chance(0.4) ? 'cash' : 'bank',
    });
  }
  return students;
}

function makeEmployees(months: string[]): SeedEmployee[] {
  const employees: SeedEmployee[] = [];
  const ROLES_SALARY: [number, number][] = [
    [3_000_000, 4_500_000],
    [4_500_000, 6_500_000],
    [6_500_000, 9_000_000],
  ];
  for (let i = 0; i < 22; i++) {
    const [lo, hi] = ROLES_SALARY[i % 3]!;
    // 16 xodim boshidan, qolganlari keyinroq ishga olingan
    const startMonth = i < 16 ? FIRST_MONTH : months[randInt(6, 30)]!;
    employees.push({
      _id: `emp-${String(i + 1).padStart(3, '0')}`,
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      salary: Math.round(randInt(lo, hi) / 100_000) * 100_000,
      startMonth,
    });
  }
  return employees;
}

// ── Asosiy seed ───────────────────────────────────────────────────────

async function seed(db: Db): Promise<void> {
  const t0 = Date.now();
  console.log('[seed] Baza tozalanmoqda...');
  await db.collection(COLLECTIONS.ENTRIES).deleteMany({});
  await db.collection(COLLECTIONS.STUDENTS).deleteMany({});
  await db.collection(COLLECTIONS.EMPLOYEES).deleteMany({});
  await ensureIndexes(db);

  const months = monthRange(FIRST_MONTH, LAST_MONTH);
  const students = makeStudents(months);
  const employees = makeEmployees(months);
  await db.collection(COLLECTIONS.STUDENTS).insertMany(students as never[]);
  await db.collection(COLLECTIONS.EMPLOYEES).insertMany(employees as never[]);
  console.log(`[seed] ${students.length} o'quvchi, ${employees.length} xodim, ${months.length} oy`);

  // Kapital, jihoz, kredit jadvali
  await investorCapital(db, { date: utcDate(2023, 1, 3), amount: 800_000_000, investor: 'Investor A (Alisher Umarov)' });
  await investorCapital(db, { date: utcDate(2023, 2, 10), amount: 400_000_000, investor: 'Investor B (Barno Qodirova)' });
  await investorCapital(db, { date: utcDate(2024, 9, 16), amount: 300_000_000, investor: "Investor A (Alisher Umarov) — qo'shimcha" });

  await equipmentPurchase(db, { date: utcDate(2023, 1, 4), amount: 260_000_000, memo: 'Boshlang\'ich jihozlar: kompyuterlar, mebel, proyektorlar' });
  await equipmentPurchase(db, { date: utcDate(2024, 3, 12), amount: 45_000_000, memo: "Qo'shimcha kompyuter sinfi" });
  await equipmentPurchase(db, { date: utcDate(2025, 8, 21), amount: 38_000_000, memo: 'Yangi filial mebeli' });

  const LOAN_MONTH = '2023-03';
  const LOAN_AMOUNT = 300_000_000;
  const LOAN_MONTHLY_RATE = 0.18 / 12;
  const LOAN_PRINCIPAL_PART = 6_000_000;
  await loanReceived(db, { date: utcDate(2023, 3, 1), amount: LOAN_AMOUNT, memo: 'Bank krediti: yillik 18%, 50 oy' });
  let loanBalance = LOAN_AMOUNT;

  let kassaBalance = 0; // naqd pul qoldig'i — inkassatsiya hisobi uchun
  let totalPayments = 0;
  let entryCount = 0;

  for (const month of months) {
    const { year, month: m } = parseMonthKey(month);
    const lastDay = lastDayOfMonth(month);
    const idx = months.indexOf(month);

    // 1) O'quvchi to'lovlari (oy boshi, 1–7 sanalar)
    const paymentBatch: NewEntry[] = [];
    for (const s of students) {
      if (month < s.startMonth || month > s.endMonth) continue;
      const sinceStart = idx - months.indexOf(s.startMonth);

      if (s.payer === 'monthly') {
        if (chance(0.04)) continue; // bu oy to'lamadi
        const day = randInt(1, 5);
        paymentBatch.push(
          buildStudentPayment({
            date: utcDate(year, m, day, randInt(9, 18)),
            amount: s.fee,
            method: s.method,
            allocations: [{ month, amount: s.fee }],
            studentId: s._id,
          }),
        );
        totalPayments += s.fee;
        if (s.method === 'cash') kassaBalance += s.fee;
      } else if (sinceStart % 3 === 0) {
        // 3 oylik oldindan to'lov — faqat o'qish davri ichidagi oylar uchun
        const allocs = [];
        for (let k = 0; k < 3; k++) {
          const am = addMonths(month, k);
          if (am <= s.endMonth) allocs.push({ month: am, amount: s.fee });
        }
        if (allocs.length === 0) continue;
        const amount = allocs.reduce((sum, a) => sum + a.amount, 0);
        const day = randInt(1, 7);
        paymentBatch.push(
          buildStudentPayment({
            date: utcDate(year, m, day, randInt(9, 18)),
            amount,
            method: s.method,
            allocations: allocs,
            studentId: s._id,
          }),
        );
        totalPayments += amount;
        if (s.method === 'cash') kassaBalance += amount;
      }
    }
    entryCount += await postMany(db, paymentBatch);

    // 2) O'tgan oy ish haqining to'lovi (5-sana)
    if (idx > 0) {
      const prevMonth = months[idx - 1]!;
      const prevAccrued = employees
        .filter((e) => e.startMonth <= prevMonth)
        .reduce((sum, e) => sum + e.salary, 0);
      if (prevAccrued > 0) {
        await paySalaries(db, { date: utcDate(year, m, 5, 10), amount: prevAccrued, forMonth: prevMonth });
        entryCount++;
      }
    }

    // 3) Oylik xarajatlar
    await payExpense(db, { date: utcDate(year, m, randInt(3, 5)), amount: 10_000_000, expense: 'ijara', memo: `${month} ijara to'lovi` });
    await payExpense(db, { date: utcDate(year, m, randInt(12, 18)), amount: randInt(15, 35) * 100_000, expense: 'kommunal', memo: `${month} kommunal to'lovlari` });
    await payExpense(db, { date: utcDate(year, m, randInt(8, 25)), amount: randInt(30, 80) * 100_000, expense: 'marketing', memo: `${month} reklama va marketing` });
    entryCount += 3;

    // 4) Kredit to'lovi (20-sana) — asosiy qarz + foiz
    if (month > LOAN_MONTH && loanBalance > 0) {
      const interest = Math.round(loanBalance * LOAN_MONTHLY_RATE);
      const principal = Math.min(LOAN_PRINCIPAL_PART, loanBalance);
      await loanPayment(db, { date: utcDate(year, m, 20, 11), principal, interest });
      loanBalance -= principal;
      entryCount++;
    }

    // 5) Oy oxiri: inkassatsiya — kassada kichik qoldiq (float) qoladi
    const float = randInt(3, 15) * 100_000;
    if (kassaBalance > float) {
      const transfer = kassaBalance - float;
      await cashTransfer(db, { date: utcDate(year, m, lastDay, 16), amount: transfer });
      kassaBalance -= transfer;
      entryCount++;
    }

    // 6) Oy oxiri: darslar o'tildi — daromad tan olinadi
    const rec = await recognizeMonth(db, month);
    if (rec) entryCount++;

    // 7) Oy oxiri: ish haqi hisoblanadi (to'lov keyingi oyning 5-sanasida)
    const accrued = employees
      .filter((e) => e.startMonth <= month)
      .reduce((sum, e) => sum + e.salary, 0);
    if (accrued > 0) {
      await accrueSalaries(db, {
        month,
        amount: accrued,
        meta: { employees: employees.filter((e) => e.startMonth <= month).length },
      });
      entryCount++;
    }
  }

  const total = await db.collection(COLLECTIONS.ENTRIES).countDocuments();
  console.log('');
  console.log('════════════════════════════════════════════════');
  console.log('  SEED YAKUNLANDI');
  console.log('════════════════════════════════════════════════');
  console.log(`  Davr:              ${FIRST_MONTH} .. ${LAST_MONTH} (${months.length} oy)`);
  console.log(`  Jurnal yozuvlari:  ${total.toLocaleString('en-US')}`);
  console.log(`  O'quvchilar:       ${students.length}`);
  console.log(`  Xodimlar:          ${employees.length}`);
  console.log(`  O'quvchi to'lovlari jami: ${totalPayments.toLocaleString('en-US')} so'm`);
  console.log(`  Vaqt:              ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log('');
  console.log("  Endi tekshiring:   npm run reconcile");
}

async function main(): Promise<void> {
  const db = await connectDb();
  await seed(db);
  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Seed xatosi:', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
