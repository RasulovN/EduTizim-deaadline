import 'dotenv/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { connectDb, ensureIndexes } from '../config/db.js';
import { ensureAuthSetup } from '../services/authService.js';
import { authRouter } from './authRoutes.js';
import { adminRouter } from './adminRoutes.js';
import { reportsRouter } from './reportsRoutes.js';
import { csrfOriginCheck } from './middleware.js';

/**
 * REST API kompozitsiyasi — server faqat middleware'lar va routerlarni
 * yig'adi; endpoint mantiqi routes/controllers qatlamlarida:
 *   /api/auth    → authRoutes.ts    (kirish, ro'yxat, refresh, tiklash, profil)
 *   /api/users|roles|logs → adminRoutes.ts (RBAC boshqaruvi, audit)
 *   /api/reports|months|reconcile → reportsRoutes.ts (moliya hisobotlari)
 *
 * Xavfsizlik: helmet, credentials bilan qat'iy CORS, CSRF Origin tekshiruvi,
 * httpOnly cookie'lardagi tokenlar, zod validatsiyasi, JSON hajm limiti,
 * login rate-limit, audit loglar.
 */

const PORT = Number(process.env.PORT ?? 4000);

/** Ruxsat etilgan originlar — vergul bilan bir nechta berish mumkin */
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function main(): Promise<void> {
  const db = await connectDb();
  await ensureIndexes(db);
  await ensureAuthSetup(db);

  const app = express();
  app.set('trust proxy', 1); // reverse-proxy ortida to'g'ri req.ip uchun
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Originsiz so'rovlar (curl, server-to-server) va ro'yxatdagilar — ruxsat
        if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
        else cb(new Error('CORS: origin ruxsat etilmagan'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      maxAge: 86_400,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(csrfOriginCheck(ALLOWED_ORIGINS));
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter(db));
  app.use('/api', adminRouter(db));
  app.use('/api', reportsRouter(db));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Topilmadi' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: err.issues[0]?.message ?? "So'rov parametrlari noto'g'ri",
        details: err.issues,
      });
      return;
    }
    if (err instanceof Error && err.message.startsWith('CORS:')) {
      res.status(403).json({ error: err.message });
      return;
    }
    console.error('[api] xato:', err);
    res.status(500).json({ error: 'Ichki server xatosi' });
  });

  app.listen(PORT, () => {
    console.log(`[api] http://localhost:${PORT} — tayyor`);
    console.log(`[api] ruxsat etilgan originlar: ${ALLOWED_ORIGINS.join(', ')}`);
  });
}

main().catch((err) => {
  console.error('Server ishga tushmadi:', err);
  process.exit(1);
});
