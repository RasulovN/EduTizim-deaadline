import { MongoClient, type Db } from 'mongodb';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { ensureAllIndexes } from '../models/index.js';

/**
 * MongoDB ulanish qatlami.
 *
 * Ustuvorlik tartibi:
 *   1. MONGODB_URI env — real MongoDB (production/lokal o'rnatilgan bo'lsa).
 *   2. Lokal mongod (127.0.0.1:27017) mavjud bo'lsa — o'shanga ulanish.
 *   3. Hech biri bo'lmasa — mongodb-memory-server ni doimiy dbPath bilan
 *      ishga tushirish (.mongo-data/). Bu tekshiruvchi MongoDB o'rnatmasdan
 *      ham `npm run seed && npm run reconcile` qila olishi uchun.
 */

let client: MongoClient | null = null;
let memServer: { stop: () => Promise<unknown> } | null = null;

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function tryConnect(uri: string, timeoutMs: number): Promise<MongoClient | null> {
  const c = new MongoClient(uri, { serverSelectionTimeoutMS: timeoutMs });
  try {
    await c.connect();
    await c.db('admin').command({ ping: 1 });
    return c;
  } catch {
    await c.close().catch(() => {});
    return null;
  }
}

export interface ConnectOptions {
  /** Testlar uchun: har safar toza, vaqtinchalik in-memory baza */
  ephemeral?: boolean;
}

export async function connectDb(opts: ConnectOptions = {}): Promise<Db> {
  if (client) return client.db(env.dbName);

  if (opts.ephemeral) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    memServer = server;
    client = new MongoClient(server.getUri());
    await client.connect();
    return client.db(env.dbName);
  }

  if (env.mongoUri) {
    client = new MongoClient(env.mongoUri);
    await client.connect();
    return client.db(env.dbName);
  }

  const local = await tryConnect('mongodb://127.0.0.1:27017', 900);
  if (local) {
    client = local;
    return client.db(env.dbName);
  }

  // Embedded rejim: doimiy dbPath → seed/reconcile/dev alohida jarayonlarda
  // ham bir xil ma'lumotni ko'radi.
  // Avvalgi ishga tushirishdan embedded instansiya tirik qolgan bo'lsa
  // (masalan, dev server qattiq o'chirilganda mongod bolasi qoladi),
  // yangisini ochmasdan o'shanga ulanamiz — port/lock to'qnashuvi bo'lmaydi.
  const leftover = await tryConnect('mongodb://127.0.0.1:27317', 700);
  if (leftover) {
    console.log('[db] Avvalgi embedded MongoDB instansiyasi topildi — qayta ishlatilmoqda');
    client = leftover;
    return client.db(env.dbName);
  }

  const dbPath = path.join(backendRoot, '..', '.mongo-data');
  mkdirSync(dbPath, { recursive: true });
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const server = await MongoMemoryServer.create({
    instance: { dbPath, storageEngine: 'wiredTiger', port: 27317 },
  });
  memServer = server;
  console.log(`[db] Lokal MongoDB topilmadi — embedded rejim (ma'lumot: ${dbPath})`);
  client = new MongoClient(server.getUri());
  await client.connect();
  return client.db(env.dbName);
}

export async function ensureIndexes(db: Db): Promise<void> {
  await ensureAllIndexes(db);
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
  if (memServer) {
    await memServer.stop();
    memServer = null;
  }
}
