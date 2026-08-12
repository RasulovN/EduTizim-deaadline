import { MongoClient, type Db } from 'mongodb';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLECTIONS } from './domain/types.js';

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

const DB_NAME = process.env.DB_NAME ?? 'edutizim_moliya';

let client: MongoClient | null = null;
let memServer: { stop: () => Promise<unknown> } | null = null;

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  if (client) return client.db(DB_NAME);

  if (opts.ephemeral) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    memServer = server;
    client = new MongoClient(server.getUri());
    await client.connect();
    return client.db(DB_NAME);
  }

  const envUri = process.env.MONGODB_URI;
  if (envUri) {
    client = new MongoClient(envUri);
    await client.connect();
    return client.db(DB_NAME);
  }

  const local = await tryConnect('mongodb://127.0.0.1:27017', 900);
  if (local) {
    client = local;
    return client.db(DB_NAME);
  }

  // Embedded rejim: doimiy dbPath → seed/reconcile/dev alohida jarayonlarda
  // ham bir xil ma'lumotni ko'radi.
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
  return client.db(DB_NAME);
}

export async function ensureIndexes(db: Db): Promise<void> {
  const entries = db.collection(COLLECTIONS.ENTRIES);
  await entries.createIndexes([
    { key: { date: 1 } },
    { key: { month: 1 } },
    { key: { 'lines.account': 1, month: 1 } },
    { key: { kind: 1, 'allocations.month': 1 } },
  ]);
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
  if (memServer) {
    await memServer.stop();
    memServer = null;
  }
}
