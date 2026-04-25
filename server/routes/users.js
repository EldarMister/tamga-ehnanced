import { Router } from 'express';
import { one, all, exec } from '../db.js';
import { authRequired, roleRequired, hashPassword } from '../auth.js';

const router = Router();
const ALLOWED_ROLES = ['director', 'manager', 'designer', 'master', 'assistant'];

const SELECT_USER = 'SELECT id, username, full_name, role, phone, is_active, lang, created_at FROM users';

router.get('/', authRequired, roleRequired('director', 'manager'), async (req, res) => {
  const rows = await all(`${SELECT_USER} ORDER BY full_name`);
  res.json(rows);
});

router.post('/', authRequired, roleRequired('director'), async (req, res) => {
  const { username, password, full_name, role, phone = '' } = req.body || {};
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ detail: 'Заполните все обязательные поля' });
  }
  if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ detail: `Недопустимая роль: ${role}` });
  const existing = await one('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) return res.status(400).json({ detail: 'Пользователь с таким логином уже существует' });
  const ins = await exec(
    'INSERT INTO users (username, password_hash, full_name, role, phone) VALUES (?, ?, ?, ?, ?) RETURNING id',
    [username, hashPassword(password), full_name, role, phone],
  );
  const newId = ins.rows[0].id;
  const row = await one(`${SELECT_USER} WHERE id = ?`, [newId]);
  res.json(row);
});

router.put('/:id', authRequired, roleRequired('director'), async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const target = await one('SELECT * FROM users WHERE id = ?', [userId]);
  if (!target) return res.status(404).json({ detail: 'Пользователь не найден' });

  const { full_name, role, phone, lang } = req.body || {};
  const updates = {};
  if (full_name != null) updates.full_name = full_name;
  if (role != null) {
    if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ detail: `Недопустимая роль: ${role}` });
    updates.role = role;
  }
  if (phone != null) updates.phone = phone;
  if (lang != null) updates.lang = lang;

  if (Object.keys(updates).length > 0) {
    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), userId];
    await exec(`UPDATE users SET ${setClause} WHERE id = ?`, values);
  }
  const row = await one(`${SELECT_USER} WHERE id = ?`, [userId]);
  res.json(row);
});

router.patch('/:id/active', authRequired, roleRequired('director'), async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const target = await one('SELECT * FROM users WHERE id = ?', [userId]);
  if (!target) return res.status(404).json({ detail: 'Пользователь не найден' });
  const newStatus = target.is_active ? 0 : 1;
  await exec('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, userId]);
  res.json({ id: userId, is_active: newStatus });
});

router.post('/:id/reset-password', authRequired, roleRequired('director'), async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const target = await one('SELECT id FROM users WHERE id = ?', [userId]);
  if (!target) return res.status(404).json({ detail: 'Пользователь не найден' });
  const newPass = '12345';
  await exec('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPass), userId]);
  res.json({ message: `Пароль сброшен на: ${newPass}` });
});

router.patch('/me/lang', authRequired, async (req, res) => {
  // Поддержка и query (?lang=ky), и body ({ lang: 'ky' }).
  const lang = req.query.lang || req.body?.lang;
  if (!['ru', 'ky'].includes(lang)) return res.status(400).json({ detail: "Язык должен быть 'ru' или 'ky'" });
  await exec('UPDATE users SET lang = ? WHERE id = ?', [lang, req.user.id]);
  res.json({ lang });
});

router.patch('/me', authRequired, async (req, res) => {
  if (req.user.role !== 'director') return res.status(403).json({ detail: 'Нет доступа' });
  const { username, phone } = req.body || {};
  const updates = {};
  if (username != null) {
    const newUsername = String(username).trim();
    if (!newUsername) return res.status(400).json({ detail: 'Логин пустой' });
    const taken = await one('SELECT id FROM users WHERE username = ? AND id != ?', [newUsername, req.user.id]);
    if (taken) return res.status(400).json({ detail: 'Логин уже занят' });
    updates.username = newUsername;
  }
  if (phone != null) updates.phone = String(phone).trim();

  if (Object.keys(updates).length > 0) {
    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), req.user.id];
    await exec(`UPDATE users SET ${setClause} WHERE id = ?`, values);
  }
  const row = await one(`${SELECT_USER} WHERE id = ?`, [req.user.id]);
  res.json(row);
});

export default router;
