import { Router } from 'express';
import { one, all, exec } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';
import { broadcast } from '../realtime.js';

const router = Router();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function parseDate(value, field) {
  if (!ISO_DATE.test(String(value || ''))) {
    const e = new Error(`Некорректная дата: ${field}`);
    e.statusCode = 400; throw e;
  }
  return new Date(value + 'T00:00:00Z');
}
function toIso(d) {
  return d.toISOString().split('T')[0];
}
function addDays(d, days) {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

const SELECT_LEAVE = `
  SELECT lr.*,
         u.full_name as user_name,
         c.full_name as created_by_name,
         rv.full_name as reviewed_by_name
  FROM leave_requests lr
  JOIN users u ON u.id = lr.user_id
  JOIN users c ON c.id = lr.created_by
  LEFT JOIN users rv ON rv.id = lr.reviewed_by
`;

router.post('/', authRequired, async (req, res, next) => {
  try {
    const data = req.body || {};
    const reqType = String(data.type || '').trim().toLowerCase();
    if (!['sick','rest'].includes(reqType)) return res.status(400).json({ detail: 'Тип заявки: sick или rest' });
    const reason = String(data.reason || '').trim();
    if (!reason) return res.status(400).json({ detail: 'Укажите причину' });

    const start = parseDate(data.date_start, 'date_start');
    let end, daysCount;
    if (data.date_end) {
      end = parseDate(data.date_end, 'date_end');
      if (end < start) return res.status(400).json({ detail: 'date_end не может быть раньше date_start' });
      daysCount = Math.round((end - start) / 86400000) + 1;
    } else if (data.days_count != null) {
      daysCount = parseInt(data.days_count, 10);
      if (!(daysCount >= 1)) return res.status(400).json({ detail: 'days_count должен быть больше 0' });
      end = addDays(start, daysCount - 1);
    } else {
      return res.status(400).json({ detail: 'Укажите date_end или days_count' });
    }

    const targetUserId = ['director','manager'].includes(req.user.role) && data.user_id
      ? parseInt(data.user_id, 10) : req.user.id;
    const target = await one('SELECT id FROM users WHERE id = ? AND is_active = 1', [targetUserId]);
    if (!target) return res.status(400).json({ detail: 'Сотрудник не найден или неактивен' });

    const ins = await exec(
      `INSERT INTO leave_requests (user_id, type, reason, date_start, date_end, days_count, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?) RETURNING id`,
      [targetUserId, reqType, reason, toIso(start), toIso(end), daysCount, req.user.id],
    );
    const row = await one(`${SELECT_LEAVE} WHERE lr.id = ?`, [ins.rows[0].id]);
    broadcast('leave:changed', { id: row.id, action: 'created' });
    res.json(row);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ detail: e.message });
    next(e);
  }
});

router.get('/', authRequired, async (req, res) => {
  const conditions = ['1=1'];
  const params = [];

  if (['director','manager'].includes(req.user.role)) {
    if (req.query.user_id) { conditions.push('lr.user_id = ?'); params.push(parseInt(req.query.user_id, 10)); }
  } else {
    conditions.push('lr.user_id = ?'); params.push(req.user.id);
  }
  if (req.query.status) {
    const s = String(req.query.status).trim().toLowerCase();
    if (!['pending','approved','rejected'].includes(s)) {
      return res.status(400).json({ detail: 'status: pending|approved|rejected' });
    }
    conditions.push('lr.status = ?'); params.push(s);
  }
  if (req.query.date_from) { conditions.push('lr.date_end >= ?'); params.push(req.query.date_from); }
  if (req.query.date_to)   { conditions.push('lr.date_start <= ?'); params.push(req.query.date_to); }

  const limit = Math.max(1, Math.min(parseInt(req.query.limit ?? '100', 10), 500));
  const offset = Math.max(0, parseInt(req.query.offset ?? '0', 10));
  const where = conditions.join(' AND ');

  const rows = await all(
    `${SELECT_LEAVE} WHERE ${where} ORDER BY lr.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const countRow = await one(`SELECT COUNT(*)::int AS cnt FROM leave_requests lr WHERE ${where}`, params);
  res.json({ items: rows, total: countRow?.cnt || 0 });
});

router.patch('/:id/status', authRequired, roleRequired('director', 'manager'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const newStatus = String(req.body?.status || '').trim().toLowerCase();
  if (!['approved','rejected'].includes(newStatus)) return res.status(400).json({ detail: 'status: approved|rejected' });

  const row = await one('SELECT * FROM leave_requests WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ detail: 'Заявка не найдена' });
  if (row.status !== 'pending') return res.status(400).json({ detail: 'Можно менять только pending-заявки' });
  if (row.user_id === req.user.id) return res.status(403).json({ detail: 'Нельзя одобрять или отклонять свою заявку' });

  await exec(
    `UPDATE leave_requests SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ? WHERE id = ?`,
    [newStatus, req.user.id, String(req.body?.review_note || '').trim(), id],
  );
  const updated = await one(`${SELECT_LEAVE} WHERE lr.id = ?`, [id]);
  broadcast('leave:changed', { id, action: 'review', status: newStatus });
  res.json(updated);
});

export default router;
