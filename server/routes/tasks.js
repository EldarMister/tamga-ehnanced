import { Router } from 'express';
import { one, all, exec } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';

const router = Router();

router.get('/', authRequired, async (req, res) => {
  const conditions = ['1=1'];
  const params = [];

  if (['designer','master','assistant'].includes(req.user.role)) {
    conditions.push('t.assigned_to = ?');
    params.push(req.user.id);
  } else if (req.query.assigned_to) {
    conditions.push('t.assigned_to = ?');
    params.push(parseInt(req.query.assigned_to, 10));
  }
  if (req.query.type) { conditions.push('t.type = ?'); params.push(req.query.type); }
  if (req.query.done === '0') conditions.push('t.is_done = 0');
  else if (req.query.done === '1') conditions.push('t.is_done = 1');

  const where = conditions.join(' AND ');
  const rows = await all(
    `SELECT t.*, u.full_name as assigned_name, c.full_name as assigned_by_name
     FROM tasks t
     JOIN users u ON u.id = t.assigned_to
     JOIN users c ON c.id = t.assigned_by
     WHERE ${where}
     ORDER BY t.is_done ASC, t.created_at DESC LIMIT 100`,
    params,
  );
  res.json(rows);
});

router.post('/', authRequired, roleRequired('director', 'manager'), async (req, res) => {
  const { title, description = '', type = 'daily', assigned_to, due_date = null } = req.body || {};
  if (!['daily','weekly'].includes(type)) return res.status(400).json({ detail: 'Тип задачи: daily или weekly' });
  if (!title) return res.status(400).json({ detail: 'Укажите название' });
  const target = await one('SELECT id FROM users WHERE id = ? AND is_active = 1', [assigned_to]);
  if (!target) return res.status(400).json({ detail: 'Сотрудник не найден' });

  const ins = await exec(
    'INSERT INTO tasks (title, description, type, assigned_to, assigned_by, due_date) VALUES (?,?,?,?,?,?) RETURNING id',
    [title, description, type, assigned_to, req.user.id, due_date],
  );
  const newId = ins.rows[0].id;
  const row = await one(
    `SELECT t.*, u.full_name as assigned_name, c.full_name as assigned_by_name
     FROM tasks t JOIN users u ON u.id = t.assigned_to JOIN users c ON c.id = t.assigned_by
     WHERE t.id = ?`,
    [newId],
  );
  res.json(row);
});

router.patch('/:id/done', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const task = await one('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!task) return res.status(404).json({ detail: 'Задача не найдена' });
  if (['designer','master','assistant'].includes(req.user.role) && task.assigned_to !== req.user.id) {
    return res.status(403).json({ detail: 'Нет доступа' });
  }
  const newDone = task.is_done ? 0 : 1;
  if (newDone) {
    await exec('UPDATE tasks SET is_done = ?, done_at = CURRENT_TIMESTAMP WHERE id = ?', [newDone, id]);
  } else {
    await exec('UPDATE tasks SET is_done = ?, done_at = NULL WHERE id = ?', [newDone, id]);
  }
  res.json({ id, is_done: newDone });
});

router.delete('/:id', authRequired, roleRequired('director', 'manager'), async (req, res) => {
  await exec('DELETE FROM tasks WHERE id = ?', [parseInt(req.params.id, 10)]);
  res.json({ ok: true });
});

export default router;
