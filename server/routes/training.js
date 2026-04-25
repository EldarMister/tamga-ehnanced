import { Router } from 'express';
import { one, all, exec } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';
import { upload, storeUpload } from '../uploads.js';

const router = Router();

router.get('/', authRequired, async (req, res) => {
  const rows = await all(
    `SELECT tr.*, u.full_name as created_by_name,
            COALESCE(tp.watched, 0) as watched
     FROM training tr
     JOIN users u ON u.id = tr.created_by
     LEFT JOIN training_progress tp ON tp.training_id = tr.id AND tp.user_id = ?
     ORDER BY tr.created_at DESC`,
    [req.user.id],
  );
  res.json(rows.map(r => ({ ...r, watched: !!r.watched })));
});

router.post('/', authRequired, roleRequired('director'), async (req, res) => {
  const data = req.body || {};
  const youtubeUrl = String(data.youtube_url || '').trim();
  const photoUrl = String(data.photo_url || '').trim() || null;
  const ins = await exec(
    `INSERT INTO training (title, description, youtube_url, photo_url, role_target, assigned_to, created_by, is_required)
     VALUES (?,?,?,?,?,?,?,?) RETURNING id`,
    [
      data.title, data.description || '', youtubeUrl, photoUrl,
      data.role_target || null, data.assigned_to || null, req.user.id, data.is_required ? 1 : 0,
    ],
  );
  const row = await one('SELECT * FROM training WHERE id = ?', [ins.rows[0].id]);
  res.json(row);
});

router.patch('/:id/watch', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await one(
    'SELECT * FROM training_progress WHERE training_id = ? AND user_id = ?',
    [id, req.user.id],
  );
  if (existing) {
    const newVal = existing.watched ? 0 : 1;
    await exec('UPDATE training_progress SET watched = ?, watched_at = CURRENT_TIMESTAMP WHERE id = ?', [newVal, existing.id]);
  } else {
    await exec(
      'INSERT INTO training_progress (training_id, user_id, watched, watched_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)',
      [id, req.user.id],
    );
  }
  res.json({ ok: true });
});

router.delete('/:id', authRequired, roleRequired('director'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await exec('DELETE FROM training_progress WHERE training_id = ?', [id]);
  await exec('DELETE FROM training WHERE id = ?', [id]);
  res.json({ ok: true });
});

router.post('/:id/photo', authRequired, roleRequired('director'), upload.single('file'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!req.file) return res.status(400).json({ detail: 'Файл не получен' });
  const item = await one('SELECT id FROM training WHERE id = ?', [id]);
  if (!item) return res.status(404).json({ detail: 'Урок не найден' });

  const stored = await storeUpload({
    prefix: `training_${id}`,
    originalname: req.file.originalname,
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
  });
  await exec('UPDATE training SET photo_file = ? WHERE id = ?', [stored.filename, id]);
  res.json({ filename: stored.filename });
});

router.get('/progress', authRequired, roleRequired('director', 'manager'), async (req, res) => {
  const employees = await all('SELECT id, full_name, role FROM users WHERE is_active = 1 ORDER BY full_name');
  const trainings = await all('SELECT id, title, is_required FROM training ORDER BY created_at DESC');
  const allProgress = await all('SELECT user_id, training_id, watched FROM training_progress WHERE watched = 1');

  const watchedByUser = {};
  for (const p of allProgress) (watchedByUser[p.user_id] ??= new Set()).add(p.training_id);

  const total = trainings.length;
  res.json(employees.map(emp => {
    const done = (watchedByUser[emp.id] || new Set()).size;
    return {
      employee: emp,
      total,
      watched: done,
      percent: total ? Math.round(done / total * 100) : 0,
    };
  }));
});

export default router;
