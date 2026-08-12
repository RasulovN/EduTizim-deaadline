import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';

/**
 * Har bir test fayli o'zining toza, vaqtinchalik MongoDB instansiyasida
 * ishlaydi — stsenariylar bir-biriga mutlaqo ta'sir qilmaydi
 * (topshiriq talabi: "har biri alohida, bo'sh bazadan boshlanadi").
 */
export interface TestContext {
  db: Db;
  stop: () => Promise<void>;
}

export async function setupTestDb(): Promise<TestContext> {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  await client.connect();
  const db = client.db('test_moliya');
  return {
    db,
    stop: async () => {
      await client.close();
      await server.stop();
    },
  };
}
