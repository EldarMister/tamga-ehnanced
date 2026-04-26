import { Router } from 'express';
import { one, all, exec } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';
import { broadcast } from '../realtime.js';

const router = Router();

function withAvailability(m) {
  const available = m.quantity - m.reserved;
  return { ...m, available, is_low: available < m.low_threshold };
}

router.get('/', authRequired, async (req, res) => {
  if (!['director', 'manager', 'master'].includes(req.user.role)) {
    return res.status(403).json({ detail: 'Нет доступа' });
  }
  const rows = await all('SELECT * FROM materials ORDER BY id LIMIT 200');
  res.json(rows.map(withAvailability));
});

router.get('/alerts', authRequired, async (req, res) => {
  if (!['director', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ detail: 'Нет доступа' });
  }
  const rows = await all('SELECT * FROM materials WHERE (quantity - reserved) < low_threshold ORDER BY id');
  res.json(rows);
});

router.get('/:id/ledger', authRequired, roleRequired('director', 'manager'), async (req, res) => {
  const matId = parseInt(req.params.id, 10);
  const limit = parseInt(req.query.limit ?? '50', 10);
  const offset = parseInt(req.query.offset ?? '0', 10);
  const rows = await all(
    `SELECT ml.*, u.full_name, o.order_number
     FROM material_ledger ml
     JOIN users u ON u.id = ml.performed_by
     LEFT JOIN orders o ON o.id = ml.order_id
     WHERE ml.material_id = ?
     ORDER BY ml.created_at DESC LIMIT ? OFFSET ?`,
    [matId, limit, offset],
  );
  res.json(rows);
});

async function adjustMaterial(req, res, action, defaultNote, requirePositive) {
  const matId = parseInt(req.params.id, 10);
  const quantity = Number(req.body?.quantity);
  const note = String(req.body?.note || defaultNote);
  if (!Number.isFinite(quantity)) return res.status(400).json({ detail: 'Некорректное количество' });
  if (requirePositive && quantity <= 0) return res.status(400).json({ detail: 'Количество должно быть положительным' });

  const mat = await one('SELECT * FROM materials WHERE id = ?', [matId]);
  if (!mat) return res.status(404).json({ detail: 'Материал не найден' });

  await exec('UPDATE materials SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [quantity, matId]);
  await exec(
    'INSERT INTO material_ledger (material_id, action, quantity, note, performed_by) VALUES (?, ?, ?, ?, ?)',
    [matId, action, quantity, note, req.user.id],
  );

  const updated = await one('SELECT * FROM materials WHERE id = ?', [matId]);
  broadcast('inventory:changed', { material_id: matId, action });
  res.json(withAvailability(updated));
}

router.post('/:id/receive', authRequired, roleRequired('director', 'manager'),
  (req, res) => adjustMaterial(req, res, 'receive', 'Приход материала', true));

router.post('/:id/correction', authRequired, roleRequired('director', 'manager'),
  (req, res) => adjustMaterial(req, res, 'correction', 'Корректировка', false));

export default router;
