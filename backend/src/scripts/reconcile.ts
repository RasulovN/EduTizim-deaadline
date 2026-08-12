import { closeDb, connectDb } from '../config/db.js';
import { reconcile } from '../services/reconcile.js';

/**
 * `npm run reconcile` — bazadagi HAMMA oy bo'yicha uchala tenglikni
 * tekshiradi. Hammasi to'g'ri bo'lsa exit 0, aks holda exit 1.
 */

function fmt(n: number): string {
  return n.toLocaleString('en-US').replace(/,/g, ' ');
}

async function main(): Promise<void> {
  const db = await connectDb();
  const started = Date.now();
  const result = await reconcile(db);

  console.log('');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  RECONCILE — uchta tenglik tekshiruvi');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  Bazadagi oylar soni: ${result.months}`);
  console.log('');

  for (const eq of result.equations) {
    const status = eq.mismatched === 0 ? '✅' : '❌';
    console.log(`${status} ${eq.name}`);
    console.log(`   Tekshirildi: ${eq.checked} oy | Mos kelmadi: ${eq.mismatched} oy | Farq: ${fmt(eq.totalAbsDiff)} so'm`);
    for (const f of eq.failures.slice(0, 12)) {
      console.log(`     · ${f.month}: farq ${fmt(f.diff)} so'm`);
    }
    if (eq.failures.length > 12) {
      console.log(`     · ... va yana ${eq.failures.length - 12} oy`);
    }
    console.log('');
  }

  console.log(`  Vaqt: ${Date.now() - started} ms`);
  console.log(result.ok ? "  NATIJA: HAMMASI MOS ✅" : '  NATIJA: FARQLAR BOR ❌');
  console.log('════════════════════════════════════════════════════════════════');

  await closeDb();
  process.exit(result.ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Reconcile xatosi:', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
