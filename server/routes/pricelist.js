import { Router } from 'express';
import { one, all, exec } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';

const router = Router();

router.get('/', authRequired, async (req, res) => {
  const rows = await all('SELECT * FROM services WHERE is_active = 1 ORDER BY id LIMIT 200');
  const result = rows.map(r => {
    const item = { ...r };
    if (req.user.role !== 'director') delete item.cost_price;
    return item;
  });
  res.json(result);
});

router.put('/:id', authRequired, roleRequired('director'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const svc = await one('SELECT * FROM services WHERE id = ?', [id]);
  if (!svc) return res.status(404).json({ detail: 'Услуга не найдена' });

  const { price_retail, price_dealer, cost_price } = req.body || {};

  await exec(
    'INSERT INTO price_history (service_id, price_retail, price_dealer, changed_by) VALUES (?, ?, ?, ?)',
    [id, svc.price_retail, svc.price_dealer, req.user.id],
  );

  const updates = { price_retail: Number(price_retail) || 0, price_dealer: Number(price_dealer) || 0 };
  if (cost_price != null) updates.cost_price = Number(cost_price) || 0;

  const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), id];
  await exec(`UPDATE services SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);

  const updated = await one('SELECT * FROM services WHERE id = ?', [id]);
  res.json(updated);
});

export default router;
