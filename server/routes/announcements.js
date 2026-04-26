import { Router } from 'express';
import { one, all, exec } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';

const router = Router();

router.get('/', authRequired, async (req, res) => {
  const conditions = ['(a.target_user_id IS NULL OR a.target_user_id = ?)'];
  const params = [req.user.id];
  if (req.query.unread) conditions.push('r.id IS NULL');

  const where = conditions.join(' AND ');
  const rows = await all(
    `SELECT a.*, u.full_name as created_by_name,
            CASE WHEN r.id IS NULL THEN 0 ELSE 1 END as is_read
     FROM announcements a
     JOIN users u ON u.id = a.created_by
     LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = ?
     WHERE ${where}
     ORDER BY a.created_at DESC LIMIT 100`,
    [req.user.id, ...params],
  );
  res.json(rows);
});

router.post('/', authRequired, roleRequired('director'), async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ detail: 'Сообщение пустое' });
  const targetUserId = req.body?.target_user_id || null;

  const ins = await exec(
    'INSERT INTO announcements (message, target_user_id, created_by) VALUES (?, ?, ?) RETURNING id',
    [message, targetUserId, req.user.id],
  );
  const row = await one('SELECT * FROM announcements WHERE id = ?', [ins.rows[0].id]);

  // Real-time push: всем (или одному, если target).
  const { broadcast } = await import('../realtime.js');
  broadcast('announcement:new', { id: row.id, message: row.message, target_user_id: row.target_user_id });

  res.json(row);
});

router.post('/:id/read', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await exec(
    `INSERT INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)
     ON CONFLICT(announcement_id, user_id) DO NOTHING`,
    [id, req.user.id],
  );
  res.json({ ok: true });
});

export default router;
