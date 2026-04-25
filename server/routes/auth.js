import { Router } from 'express';
import { one, exec } from '../db.js';
import { verifyPassword, createToken, hashPassword, authRequired } from '../auth.js';

const router = Router();

function publicUser(u) {
  return {
    id: u.id, username: u.username, full_name: u.full_name,
    role: u.role, lang: u.lang, phone: u.phone,
  };
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ detail: 'Логин и пароль обязательны' });
  const user = await one('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ detail: 'Неверный логин или пароль' });
  }
  const token = createToken(user.id, user.role);
  res.json({ token, user: publicUser(user) });
});

router.get('/me', authRequired, (req, res) => {
  res.json(publicUser(req.user));
});

router.post('/change-password', authRequired, async (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) return res.status(400).json({ detail: 'Заполните оба поля' });
  if (!verifyPassword(old_password, req.user.password_hash)) {
    return res.status(400).json({ detail: 'Неверный текущий пароль' });
  }
  await exec('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(new_password), req.user.id]);
  res.json({ ok: true });
});

export default router;
