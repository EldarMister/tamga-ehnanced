import { Router } from 'express';
import { one, all, exec, pool, query } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';
import { upload, storeUpload } from '../uploads.js';
import { broadcast } from '../realtime.js';

const router = Router();

// Разрешённые переходы статусов: from -> [{ to, roles }]
const TRANSITIONS = {
  created:      [['design', ['manager','director']], ['production',['manager','director']], ['cancelled',['manager','director']], ['defect',['manager','director']]],
  design:       [['production',['designer','manager','director']], ['cancelled',['manager','director']], ['defect',['manager','director']]],
  production:   [['ready',['master','manager','director']], ['cancelled',['manager','director']], ['defect',['manager','director']]],
  ready:        [['closed',['manager','director']], ['cancelled',['manager','director']], ['defect',['manager','director']]],
  design_done:  [['production',['manager','director','master']], ['ready',['manager','director']], ['cancelled',['manager','director']], ['defect',['manager','director']]],
  printed:      [['ready',['manager','director']], ['cancelled',['manager','director']], ['defect',['manager','director']]],
  postprocess:  [['ready',['assistant','manager','director']], ['cancelled',['manager','director']], ['defect',['manager','director']]],
  defect:       [['cancelled',['manager','director']]],
};

function isAreaUnit(unit) {
  if (!unit) return false;
  const u = String(unit).toLowerCase().replace(/\s+/g, '');
  return u.includes('м2') || u.includes('м²') || u.includes('m2') || u.includes('m²');
}

function calcItemTotal(unit, unitPrice, quantity, width, height) {
  if (isAreaUnit(unit)) {
    if (!width || !height) {
      const err = new Error('Нужны ширина и высота для услуги в м²');
      err.statusCode = 400;
      throw err;
    }
    const area = width * height;
    const calcUnits = area * quantity;
    return { itemTotal: calcUnits * unitPrice, calcUnits };
  }
  return { itemTotal: quantity * unitPrice, calcUnits: quantity };
}

const ORDER_COLS = `id, order_number, client_name, client_phone, client_type, status,
  total_price, material_cost, notes, design_file, photo_file,
  CASE WHEN photo_file IS NOT NULL AND TRIM(photo_file) <> '' THEN 1 ELSE 0 END AS has_photo,
  assigned_designer, assigned_master, assigned_assistant, deadline,
  created_by, created_at, updated_at`;

function serializeOrder(row, opts = {}) {
  if (!row) return row;
  const o = { ...row };
  const hasPhoto = !!o.has_photo || (o.photo_file && String(o.photo_file).trim());
  o.photo_url = hasPhoto ? `/api/orders/${o.id}/photo/raw?v=${encodeURIComponent(o.updated_at || '')}` : '';
  delete o.has_photo;
  if (opts.hideMaterialCost) delete o.material_cost;
  return o;
}

async function generateOrderNumber(client) {
  const year = new Date().getFullYear();
  const prefix = `POL-${year}-`;
  const r = await client.query(
    "SELECT order_number FROM orders WHERE order_number LIKE $1 ORDER BY id DESC LIMIT 1",
    [`${prefix}%`],
  );
  if (r.rowCount > 0) {
    const last = parseInt(r.rows[0].order_number.split('-').pop(), 10) || 0;
    return `${prefix}${String(last + 1).padStart(3, '0')}`;
  }
  return `${prefix}001`;
}

// ─── List + Get ───────────────────────────────────────────────────────────────

router.get('/', authRequired, async (req, res) => {
  const status = String(req.query.status || '');
  const search = String(req.query.search || '');
  const limit = parseInt(req.query.limit ?? '100', 10);
  const offset = parseInt(req.query.offset ?? '0', 10);

  const conditions = ['1=1'];
  const params = [];

  if (status) {
    if (status === 'closed') conditions.push("o.status IN ('closed','cancelled')");
    else { conditions.push('o.status = ?'); params.push(status); }
  }
  if (search) {
    conditions.push('(o.order_number ILIKE ? OR o.client_name ILIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (req.user.role === 'designer') {
    conditions.push("(o.assigned_designer = ? OR o.status = 'design')");
    params.push(req.user.id);
  } else if (req.user.role === 'master') {
    conditions.push("(o.assigned_master = ? OR o.status IN ('design_done','production','printed'))");
    params.push(req.user.id);
  } else if (req.user.role === 'assistant') {
    conditions.push("(o.assigned_assistant = ? OR o.status = 'postprocess')");
    params.push(req.user.id);
  }

  const where = conditions.join(' AND ');
  const orders = await all(
    `SELECT ${ORDER_COLS.replace(/(\bid\b|order_number|client_name|client_phone|client_type|status|total_price|material_cost|notes|design_file|photo_file|assigned_designer|assigned_master|assigned_assistant|deadline|created_by|created_at|updated_at)/g, 'o.$1')} FROM orders o WHERE ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const countRow = await one(`SELECT COUNT(*)::int AS n FROM orders o WHERE ${where}`, params);

  const hideCost = req.user.role !== 'director';
  const result = orders.map(o => serializeOrder(o, { hideMaterialCost: hideCost }));

  if (result.length > 0) {
    const orderIds = result.map(o => o.id);
    const placeholders = orderIds.map((_, i) => `$${i + 1}`).join(',');
    const itemsRes = await pool.query(
      `SELECT oi.*, s.name_ru, s.unit FROM order_items oi JOIN services s ON s.id = oi.service_id WHERE oi.order_id IN (${placeholders})`,
      orderIds,
    );
    const itemsByOrder = {};
    for (const item of itemsRes.rows) {
      (itemsByOrder[item.order_id] ??= []).push(item);
    }
    for (const o of result) o.items = itemsByOrder[o.id] || [];
  }

  res.json({ orders: result, total: countRow?.n || 0 });
});

router.get('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const order = await one(`SELECT ${ORDER_COLS} FROM orders WHERE id = ?`, [id]);
  if (!order) return res.status(404).json({ detail: 'Заказ не найден' });

  const hideCost = req.user.role !== 'director';
  const result = serializeOrder(order, { hideMaterialCost: hideCost });

  result.items = await all(
    `SELECT oi.*, s.name_ru, s.code, s.unit FROM order_items oi JOIN services s ON s.id = oi.service_id WHERE oi.order_id = ?`,
    [id],
  );
  result.history = await all(
    `SELECT oh.*, u.full_name FROM order_history oh JOIN users u ON u.id = oh.changed_by WHERE oh.order_id = ? ORDER BY oh.created_at`,
    [id],
  );
  res.json(result);
});

// Сырой контент фото — отдаём из uploads (новый путь) либо из orders.photo_blob (legacy).
router.get('/:id/photo/raw', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await one('SELECT photo_file, photo_mime, photo_blob FROM orders WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ detail: 'Заказ не найден' });

  const filename = (row.photo_file || '').trim();
  if (filename) {
    const upl = await one('SELECT mime, data FROM uploads WHERE filename = ?', [filename]);
    if (upl) {
      res.setHeader('Content-Type', upl.mime || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(upl.data);
    }
  }
  if (row.photo_blob) {
    res.setHeader('Content-Type', row.photo_mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(row.photo_blob);
  }
  return res.status(404).json({ detail: 'Фото не найдено' });
});

// ─── Create ───────────────────────────────────────────────────────────────────
router.post('/', authRequired, roleRequired('manager', 'director'), async (req, res, next) => {
  const data = req.body || {};
  if (!Array.isArray(data.items) || data.items.length === 0) {
    return res.status(400).json({ detail: 'Нужны позиции заказа' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderNumber = await generateOrderNumber(client);

    let totalPrice = 0;
    let materialCost = 0;
    const itemsData = [];

    for (const item of data.items) {
      const svcRes = await client.query('SELECT * FROM services WHERE id = $1 AND is_active = 1', [item.service_id]);
      const svc = svcRes.rows[0];
      if (!svc) {
        const e = new Error(`Услуга ${item.service_id} не найдена`);
        e.statusCode = 400; throw e;
      }
      const unitPrice = (data.client_type === 'dealer' && svc.price_dealer > 0) ? svc.price_dealer : svc.price_retail;
      const { itemTotal, calcUnits } = calcItemTotal(svc.unit, unitPrice, Number(item.quantity), item.width, item.height);
      totalPrice += itemTotal;

      const mapRes = await client.query(
        `SELECT sm.*, m.code as mat_code, m.name_ru as mat_name, m.quantity as mat_quantity, m.reserved as mat_reserved
         FROM service_material_map sm JOIN materials m ON m.id = sm.material_id WHERE sm.service_id = $1`,
        [svc.id],
      );
      let materialId = null, materialQty = 0;
      if (mapRes.rowCount > 0) {
        const mapping = mapRes.rows[0];
        materialId = mapping.material_id;
        materialQty = calcUnits * Number(mapping.ratio);
        materialCost += materialQty * Number(svc.cost_price || 0);
        const available = Number(mapping.mat_quantity) - Number(mapping.mat_reserved);
        if (available < materialQty) {
          const e = new Error(`Недостаточно материала '${mapping.mat_name}': доступно ${available.toFixed(1)}, нужно ${materialQty.toFixed(1)}`);
          e.statusCode = 400; throw e;
        }
        await client.query(
          'UPDATE materials SET reserved = reserved + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [materialQty, materialId],
        );
      }

      itemsData.push({
        service_id: svc.id, material_id: materialId,
        quantity: item.quantity, width: item.width ?? null, height: item.height ?? null,
        unit_price: unitPrice, total: itemTotal,
        material_qty: materialQty, options: JSON.stringify(item.options || {}),
      });
    }

    const ins = await client.query(
      `INSERT INTO orders (order_number, client_name, client_phone, client_type, total_price, material_cost,
         notes, deadline, assigned_designer, assigned_master, assigned_assistant, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [orderNumber, data.client_name, data.client_phone || '', data.client_type || 'retail',
       totalPrice, materialCost, data.notes || '', data.deadline || null,
       data.assigned_designer || null, data.assigned_master || null, data.assigned_assistant || null, req.user.id],
    );
    const orderId = ins.rows[0].id;

    for (const it of itemsData) {
      await client.query(
        `INSERT INTO order_items (order_id, service_id, material_id, quantity, width, height, unit_price, total, material_qty, options)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [orderId, it.service_id, it.material_id, it.quantity, it.width, it.height, it.unit_price, it.total, it.material_qty, it.options],
      );
      if (it.material_id && it.material_qty > 0) {
        await client.query(
          `INSERT INTO material_ledger (material_id, order_id, action, quantity, note, performed_by)
           VALUES ($1,$2,'reserve',$3,'Резерв при создании заказа',$4)`,
          [it.material_id, orderId, -it.material_qty, req.user.id],
        );
      }
    }

    await client.query(
      `INSERT INTO order_history (order_id, old_status, new_status, changed_by, note)
       VALUES ($1, NULL, 'created', $2, 'Заказ создан')`,
      [orderId, req.user.id],
    );

    await client.query('COMMIT');

    const created = await one(`SELECT ${ORDER_COLS} FROM orders WHERE id = ?`, [orderId]);
    broadcast('orders:changed', { id: orderId, action: 'created' });
    res.json(serializeOrder(created));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e.statusCode) return res.status(e.statusCode).json({ detail: e.message });
    next(e);
  } finally {
    client.release();
  }
});

// ─── Update fields ────────────────────────────────────────────────────────────
router.put('/:id', authRequired, roleRequired('manager', 'director'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const order = await one(`SELECT ${ORDER_COLS} FROM orders WHERE id = ?`, [id]);
  if (!order) return res.status(404).json({ detail: 'Заказ не найден' });

  const allowed = ['client_name','client_phone','notes','deadline','assigned_designer','assigned_master','assigned_assistant'];
  const updates = {};
  for (const k of allowed) if (k in req.body) updates[k] = req.body[k];
  if (Object.keys(updates).length === 0) return res.json(serializeOrder(order));

  const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), id];
  await exec(`UPDATE orders SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);

  const updated = await one(`SELECT ${ORDER_COLS} FROM orders WHERE id = ?`, [id]);
  broadcast('orders:changed', { id, action: 'updated' });
  res.json(serializeOrder(updated));
});

// ─── Update status────────────────────────────────────────────────────────────
router.patch('/:id/status', authRequired, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const newStatus = req.body?.status;
  const note = req.body?.note || '';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderRes = await client.query('SELECT id, status FROM orders WHERE id = $1', [id]);
    if (orderRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ detail: 'Заказ не найден' });
    }
    const current = orderRes.rows[0].status;

    let valid = req.user.role === 'director';
    if (!valid) {
      const allowed = TRANSITIONS[current] || [];
      valid = allowed.some(([toStatus, roles]) => toStatus === newStatus && roles.includes(req.user.role));
    }
    if (!valid) {
      await client.query('ROLLBACK');
      return res.status(400).json({ detail: `Переход '${current}' -> '${newStatus}' не разрешён для роли '${req.user.role}'` });
    }

    if (newStatus === 'production') {
      const items = (await client.query('SELECT * FROM order_items WHERE order_id = $1', [id])).rows;
      for (const item of items) {
        if (item.material_id && item.material_qty > 0) {
          await client.query(
            'UPDATE materials SET quantity = quantity - $1, reserved = reserved - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [item.material_qty, item.material_id],
          );
          await client.query(
            `INSERT INTO material_ledger (material_id, order_id, action, quantity, note, performed_by)
             VALUES ($1,$2,'consume',$3,'Списание при печати',$4)`,
            [item.material_id, id, -item.material_qty, req.user.id],
          );
        }
      }
    } else if (newStatus === 'cancelled') {
      const items = (await client.query('SELECT * FROM order_items WHERE order_id = $1', [id])).rows;
      for (const item of items) {
        if (item.material_id && item.material_qty > 0 && ['created','design','design_done'].includes(current)) {
          await client.query(
            'UPDATE materials SET reserved = reserved - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [item.material_qty, item.material_id],
          );
          await client.query(
            `INSERT INTO material_ledger (material_id, order_id, action, quantity, note, performed_by)
             VALUES ($1,$2,'unreserve',$3,'Возврат при отмене заказа',$4)`,
            [item.material_id, id, item.material_qty, req.user.id],
          );
        }
      }
    }

    await client.query('UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newStatus, id]);
    await client.query(
      'INSERT INTO order_history (order_id, old_status, new_status, changed_by, note) VALUES ($1,$2,$3,$4,$5)',
      [id, current, newStatus, req.user.id, note || `${current} -> ${newStatus}`],
    );

    if (newStatus === 'ready') {
      await client.query(
        `INSERT INTO client_notifications (order_id, channel, message, status)
         VALUES ($1,'manual','Ваш заказ готов. Можете забирать. PolyControl.','queued')`,
        [id],
      );
    }

    await client.query('COMMIT');
    const updated = await one(`SELECT ${ORDER_COLS} FROM orders WHERE id = ?`, [id]);
    broadcast('orders:changed', { id, action: 'status', status: newStatus });
    res.json(serializeOrder(updated));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

router.post('/:id/notify', authRequired, roleRequired('manager', 'director'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const order = await one('SELECT id FROM orders WHERE id = ?', [id]);
  if (!order) return res.status(404).json({ detail: 'Заказ не найден' });

  const message = req.body?.message || 'Ваш заказ готов. Можете забирать. PolyControl.';
  const channels = req.body?.channels || ['manual'];
  const created = [];
  for (const ch of channels) {
    const r = await query(
      "INSERT INTO client_notifications (order_id, channel, message, status) VALUES (?, ?, ?, 'queued') RETURNING id",
      [id, ch, message],
    );
    created.push({ id: r.rows[0].id, channel: ch });
  }
  res.json({ ok: true, notifications: created });
});

// ─── Uploads ──────────────────────────────────────────────────────────────────
router.post('/:id/photo', authRequired, upload.single('file'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!req.file) return res.status(400).json({ detail: 'Файл не получен' });
  const order = await one('SELECT id FROM orders WHERE id = ?', [id]);
  if (!order) return res.status(404).json({ detail: 'Заказ не найден' });

  const stored = await storeUpload({
    prefix: `order_${id}`,
    originalname: req.file.originalname,
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
  });
  await exec(
    'UPDATE orders SET photo_file = ?, photo_mime = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [stored.filename, stored.mime, id],
  );
  res.json({ filename: stored.filename, url: `/api/orders/${id}/photo/raw?v=${Date.now()}` });
});

router.post('/:id/design', authRequired, upload.single('file'), async (req, res) => {
  if (!['designer','manager','director'].includes(req.user.role)) {
    return res.status(403).json({ detail: 'Нет доступа' });
  }
  const id = parseInt(req.params.id, 10);
  if (!req.file) return res.status(400).json({ detail: 'Файл не получен' });
  const order = await one('SELECT id FROM orders WHERE id = ?', [id]);
  if (!order) return res.status(404).json({ detail: 'Заказ не найден' });

  const stored = await storeUpload({
    prefix: `design_${id}`,
    originalname: req.file.originalname,
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
  });
  await exec(
    'UPDATE orders SET design_file = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [stored.filename, id],
  );
  res.json({ filename: stored.filename });
});

export default router;
