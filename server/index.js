import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { initDb } from './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';

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
