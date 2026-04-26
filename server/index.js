import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { initDb } from './db.js';
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

// 404
app.use('/api', (req, res) => res.status(404).json({ detail: 'Эндпоинт не найден' }));

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
