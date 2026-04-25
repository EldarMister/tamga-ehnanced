import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { exec, one } from './db.js';

// В памяти, не в файловой системе — на Railway FS эфемерна.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

function guessMime(filename, fallback) {
  const ext = path.extname(filename || '').toLowerCase();
  return MIME_BY_EXT[ext] || fallback || 'application/octet-stream';
}

// Сохраняет файл в uploads и возвращает имя записи (для использования в parent record).
export async function storeUpload({ prefix, originalname, buffer, mimetype }) {
  const ext = path.extname(originalname || '') || '.bin';
  const filename = `${prefix}_${crypto.randomBytes(8).toString('hex')}${ext}`;
  const mime = (mimetype && mimetype.startsWith('image/')) ? mimetype : guessMime(originalname, mimetype);
  await exec('INSERT INTO uploads (filename, mime, data) VALUES (?, ?, ?)', [filename, mime, buffer]);
  return { filename, mime };
}

// Express handler: GET /api/uploads/:filename
export async function serveUpload(req, res) {
  const { filename } = req.params;
  const row = await one('SELECT mime, data FROM uploads WHERE filename = ?', [filename]);
  if (!row) return res.status(404).json({ detail: 'Файл не найден' });
  res.setHeader('Content-Type', row.mime || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(row.data);
}
