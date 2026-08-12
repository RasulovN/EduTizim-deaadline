import 'dotenv/config';

/**
 * Markazlashgan konfiguratsiya — baza/server sozlamalari.
 * (JWT sozlamalari services/authService.ts da — u production'da
 * JWT_SECRET yo'qligini o'zi tekshiradi.)
 */

export const env = {
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI, // yo'q bo'lsa: lokal mongod → embedded
  dbName: process.env.DB_NAME ?? 'edutizim_moliya',
} as const;
