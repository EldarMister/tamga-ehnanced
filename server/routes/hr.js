import { Router } from 'express';
import { one, all, exec, pool } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';
import { upload, storeUpload } from '../uploads.js';
import { broadcast } from '../realtime.js';

const router = Router();

const todayIso = () => new Date().toISOString().split('T')[0];

// ─── Attendance ───────────────────────────────────────────────────────────────

router.post('/checkin', authRequired, async (req, res) => {
  const today = todayIso();
  const existing = await one('SELECT * FROM attendance WHERE user_id = ? AND date = ?', [req.user.id, today]);
  if (existing) return res.status(400).json({ detail: 'Вы уже отметились сегодня' });
  await exec('INSERT INTO attendance (user_id) VALUES (?)', [req.user.id]);
  const row = await one('SELECT * FROM attendance WHERE user_id = ? AND date = ?', [req.user.id, today]);
  broadcast('hr:attendance', { user_id: req.user.id, action: 'checkin' });
  res.json(row);
});

router.post('/checkout', authRequired, async (req, res) => {
  const today = todayIso();
  const existing = await one('SELECT * FROM attendance WHERE user_id = ? AND date = ?', [req.user.id, today]);
  if (!existing) return res.status(400).json({ detail: 'Вы не начинали смену сегодня' });
  if (existing.check_out) return res.status(400).json({ detail: 'Смена уже завершена' });

  const roleTasks = await all('SELECT id FROM shift_tasks WHERE role = ?', [req.user.role]);
  for (const t of roleTasks) {
    await exec(
      `INSERT INTO shift_task_logs (user_id, task_id, date, completed)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(user_id, task_id, date) DO NOTHING`,
      [req.user.id, t.id, today],
    );
  }

  const doneRow = await one(
    'SELECT COUNT(*)::int AS n FROM shift_task_logs WHERE user_id = ? AND date = ? AND completed = 1',
    [req.user.id, today],
  );
  const doneCount = doneRow?.n || 0;
  const totalCount = roleTasks.length;
  const notCompleted = Math.max(totalCount - doneCount, 0);

  await exec('UPDATE attendance SET check_out = CURRENT_TIMESTAMP WHERE id = ?', [existing.id]);
  const row = await one('SELECT * FROM attendance WHERE id = ?', [existing.id]);
  broadcast('hr:attendance', { user_id: req.user.id, action: 'checkout' });
  res.json({ ...row, shift_tasks_summary: { total: totalCount, completed: doneCount, not_completed: notCompleted } });
});

router.get('/attendance/today', authRequired, roleRequired('director', 'manager'), async (req, res) => {
  const rows = await all(
    `SELECT a.*, u.full_name, u.role FROM attendance a
     JOIN users u ON u.id = a.user_id
     WHERE a.date = ?
     ORDER BY a.check_in`,
    [todayIso()],
  );
  res.json(rows);
});

router.get('/attendance', authRequired, roleRequired('director', 'manager'), async (req, res) => {
  const conditions = ['1=1'];
  const params = [];
  if (req.query.date_from) { conditions.push('a.date >= ?'); params.push(req.query.date_from); }
  if (req.query.date_to)   { conditions.push('a.date <= ?'); params.push(req.query.date_to); }
  if (req.query.user_id)   { conditions.push('a.user_id = ?'); params.push(parseInt(req.query.user_id, 10)); }

  const where = conditions.join(' AND ');
  const rows = await all(
    `SELECT a.*, u.full_name, u.role FROM attendance a
     JOIN users u ON u.id = a.user_id
     WHERE ${where}
     ORDER BY a.date DESC, a.check_in DESC LIMIT 200`,
    params,
  );
  res.json(rows);
});

router.get('/my-attendance', authRequired, async (req, res) => {
  const row = await one('SELECT * FROM attendance WHERE user_id = ? AND date = ?', [req.user.id, todayIso()]);
  res.json(row || null);
});

// ─── Shift tasks ──────────────────────────────────────────────────────────────

router.get('/shift-tasks', authRequired, async (req, res) => {
  const targetRole = req.query.role || req.user.role;
  if (req.query.role && req.user.role !== 'director') {
    return res.status(403).json({ detail: 'Нет доступа' });
  }
  const rows = await all(
    `SELECT st.*, COALESCE(l.completed, 0) as completed
     FROM shift_tasks st
     LEFT JOIN shift_task_logs l ON l.task_id = st.id AND l.user_id = ? AND l.date = ?
     WHERE st.role = ?
     ORDER BY st.id`,
    [req.user.id, todayIso(), targetRole],
  );
  res.json(rows);
});

router.post('/shift-tasks/:id/complete', authRequired, async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const task = await one('SELECT * FROM shift_tasks WHERE id = ?', [taskId]);
  if (!task) return res.status(404).json({ detail: 'Задача не найдена' });
  if (task.role !== req.user.role && req.user.role !== 'director') {
    return res.status(403).json({ detail: 'Нет доступа' });
  }
  const completed = req.body?.completed ? 1 : 0;
  await exec(
    `INSERT INTO shift_task_logs (user_id, task_id, date, completed) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, task_id, date) DO UPDATE SET completed = EXCLUDED.completed`,
    [req.user.id, taskId, todayIso(), completed],
  );
  res.json({ ok: true });
});

router.get('/shift-tasks/catalog', authRequired, roleRequired('director'), async (req, res) => {
  const conditions = ['1=1'];
  const params = [];
  if (req.query.role) { conditions.push('role = ?'); params.push(req.query.role); }
  const where = conditions.join(' AND ');
  const rows = await all(`SELECT * FROM shift_tasks WHERE ${where} ORDER BY role, id`, params);
  res.json(rows);
});

router.post('/shift-tasks', authRequired, roleRequired('director'), async (req, res) => {
  const { role, title, is_required } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ detail: 'Название задачи пустое' });
  const r = await pool.query(
    'INSERT INTO shift_tasks (role, title, is_required) VALUES ($1, $2, $3) RETURNING *',
    [role, title.trim(), is_required ? 1 : 0],
  );
  res.json(r.rows[0]);
});

router.patch('/shift-tasks/:id', authRequired, roleRequired('director'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await one('SELECT * FROM shift_tasks WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ detail: 'Задача не найдена' });

  const { role, title, is_required } = req.body || {};
  const updates = {};
  if (role != null) updates.role = role;
  if (title != null) updates.title = String(title).trim();
  if (is_required != null) updates.is_required = is_required ? 1 : 0;

  if (Object.keys(updates).length > 0) {
    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await exec(`UPDATE shift_tasks SET ${setClause} WHERE id = ?`, [...Object.values(updates), id]);
  }
  const updated = await one('SELECT * FROM shift_tasks WHERE id = ?', [id]);
  res.json(updated);
});

router.delete('/shift-tasks/:id', authRequired, roleRequired('director'), async (req, res) => {
  await exec('DELETE FROM shift_tasks WHERE id = ?', [parseInt(req.params.id, 10)]);
  res.json({ ok: true });
});

router.get('/shift-tasks/report', authRequired, roleRequired('director'), async (req, res) => {
  const date = req.query.date || todayIso();
  const role = req.query.role;
  if (!role) return res.status(400).json({ detail: 'Нужна роль' });

  const tasks = await all('SELECT id, title, is_required FROM shift_tasks WHERE role = ? ORDER BY id', [role]);
  const users = await all('SELECT id, full_name FROM users WHERE role = ? AND is_active = 1 ORDER BY full_name', [role]);
  const logs = await all('SELECT user_id, task_id, completed FROM shift_task_logs WHERE date = ?', [date]);
  const logMap = new Map();
  for (const l of logs) logMap.set(`${l.user_id}_${l.task_id}`, l.completed);

  const items = users.map(u => ({
    user_id: u.id,
    full_name: u.full_name,
    tasks: tasks.map(t => ({
      id: t.id, title: t.title, is_required: t.is_required,
      completed: !!logMap.get(`${u.id}_${t.id}`),
    })),
  }));

  res.json({ date, role, items, tasks });
});

// ─── Incidents ────────────────────────────────────────────────────────────────

router.post('/incidents', authRequired, roleRequired('director', 'manager'), async (req, res, next) => {
  const data = req.body || {};
  const target = await one('SELECT id FROM users WHERE id = ?', [data.user_id]);
  if (!target) return res.status(400).json({ detail: 'Сотрудник не найден' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO incidents (user_id, type, description, order_id, material_waste, deduction_amount, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [data.user_id, data.type, data.description, data.order_id || null,
       data.material_waste ?? null, data.deduction_amount ?? null, req.user.id],
    );
    const incidentId = r.rows[0].id;

    if (data.type === 'defect' && data.material_waste && data.order_id) {
      const items = (await client.query(
        'SELECT * FROM order_items WHERE order_id = $1 AND material_id IS NOT NULL LIMIT 1',
        [data.order_id],
      )).rows;
      for (const item of items) {
        await client.query(
          'UPDATE materials SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [data.material_waste, item.material_id],
        );
        await client.query(
          `INSERT INTO material_ledger (material_id, order_id, action, quantity, note, performed_by)
           VALUES ($1,$2,'defect',$3,$4,$5)`,
          [item.material_id, data.order_id, -data.material_waste, `Брак: ${data.description}`, req.user.id],
        );
      }
    }
    await client.query('COMMIT');
    const row = await one('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    broadcast('hr:incident', { id: incidentId, user_id: data.user_id, type: data.type });
    res.json(row);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

router.get('/incidents', authRequired, roleRequired('director', 'manager'), async (req, res) => {
  const conditions = ['1=1'];
  const params = [];
  if (req.query.status) { conditions.push('i.status = ?'); params.push(req.query.status); }
  if (req.query.user_id) { conditions.push('i.user_id = ?'); params.push(parseInt(req.query.user_id, 10)); }
  if (req.query.date_from) { conditions.push('i.created_at >= ?'); params.push(req.query.date_from); }
  if (req.query.date_to)   { conditions.push('i.created_at <= ?'); params.push(req.query.date_to + ' 23:59:59'); }
  if (req.query.penalties_only) conditions.push('COALESCE(i.deduction_amount, 0) > 0');
  const where = conditions.join(' AND ');
  const rows = await all(
    `SELECT i.*, u.full_name as employee_name, c.full_name as created_by_name
     FROM incidents i
     JOIN users u ON u.id = i.user_id
     JOIN users c ON c.id = i.created_by
     WHERE ${where}
     ORDER BY i.created_at DESC LIMIT 200`,
    params,
  );
  res.json(rows);
});

router.patch('/incidents/:id/review', authRequired, roleRequired('director'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await exec("UPDATE incidents SET status = 'reviewed' WHERE id = ?", [id]);
  const row = await one('SELECT * FROM incidents WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ detail: 'Инцидент не найден' });
  res.json(row);
});

router.post('/incidents/:id/photo', authRequired, roleRequired('director', 'manager'), upload.single('file'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!req.file) return res.status(400).json({ detail: 'Файл не получен' });
  const incident = await one('SELECT id FROM incidents WHERE id = ?', [id]);
  if (!incident) return res.status(404).json({ detail: 'Инцидент не найден' });

  const stored = await storeUpload({
    prefix: `incident_${id}`,
    originalname: req.file.originalname,
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
  });
  await exec('UPDATE incidents SET photo = ? WHERE id = ?', [stored.filename, id]);
  res.json({ filename: stored.filename });
});

export default router;
