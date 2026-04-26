import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { initDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const SERVE_FRONTEND = fs.existsSync(path.join(DIST_DIR, 'index.html'));
import { serveUpload } from './uploads.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import pricelistRoutes from './routes/pricelist.js';
import inventoryRoutes from './routes/inventory.js';
import orderRoutes from './routes/orders.js';
import hrRoutes from './routes/hr.js';
import payrollRoutes from './routes/payroll.js';
import taskRoutes from './routes/tasks.js';
import trainingRoutes from './routes/training.js';
import leaveRoutes from './routes/leave_requests.js';
import announcementRoutes from './routes/announcements.js';
import reportRoutes from './routes/reports.js';
import workJournalRoutes from './routes/work_journal.js';
import { sseHandler } from './realtime.js';

const app = express();

const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: corsOrigins.length === 0 ? true : corsOrigins,
  credentials: false,
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/pricelist', pricelistRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/leave-requests', leaveRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/work-journal', workJournalRoutes);

// Real-time события через Server-Sent Events.
app.get('/api/events', sseHandler);

// Отдача загруженных файлов из таблицы uploads.
app.get('/api/uploads/:filename', serveUpload);

// 404 для /api/* — отвечаем JSON, чтобы не падать в SPA-fallback ниже.
app.use('/api', (req, res) => res.status(404).json({ detail: 'Эндпоинт не найден' }));

// Если рядом есть собранный фронт — отдаём его как статику + SPA-fallback.
// Так фронт и бэк живут в одном Railway-сервисе.
if (SERVE_FRONTEND) {
  app.use(express.static(DIST_DIR, {
    index: false,
    maxAge: '1y',
    setHeaders: (res, filePath) => {
      // index.html и манифест PWA не кешируем — иначе клиенты залипают на старой версии.
      const base = path.basename(filePath);
      if (base === 'index.html' || base === 'manifest.webmanifest' || base === 'sw.js' || base === 'registerSW.js') {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'), {
      headers: { 'Cache-Control': 'no-cache' },
    });
  });
  console.log('[tamga-server] serving frontend from', DIST_DIR);
} else {
  console.log('[tamga-server] dist/ not found — running API-only');
}

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ detail: err.message || 'Внутренняя ошибка сервера' });
});

const PORT = Number(process.env.PORT) || 8000;

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[tamga-server] listening on :${PORT}`);
    });
  })
  .catch((e) => {
    console.error('[tamga-server] init failed:', e);
    process.exit(1);
  });
