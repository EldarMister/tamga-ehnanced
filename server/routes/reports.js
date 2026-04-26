import { Router } from 'express';
import { one, all } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';

const router = Router();

function dateConditions(prefix, dateFrom, dateTo) {
  const conditions = [];
  const params = [];
  if (dateFrom) { conditions.push(`${prefix} >= ?`); params.push(dateFrom); }
  if (dateTo)   { conditions.push(`${prefix} <= ?`); params.push(dateTo + ' 23:59:59'); }
  return { conditions, params };
}

router.get('/orders-summary', authRequired, roleRequired('director', 'manager'), async (req, res) => {
  const { date_from = '', date_to = '' } = req.query;
  const dc = dateConditions('created_at', date_from, date_to);
  const where = ['1=1', ...dc.conditions].join(' AND ');

  const byStatus = await all(
    `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(total_price), 0) AS revenue
     FROM orders WHERE ${where} GROUP BY status`,
    dc.params,
  );
  const totals = await one(
    `SELECT COUNT(*)::int AS total_orders,
            COALESCE(SUM(total_price), 0) AS total_revenue,
            COALESCE(SUM(material_cost), 0) AS total_cost
     FROM orders WHERE ${where} AND status != 'cancelled'`,
    dc.params,
  );
  res.json({
    by_status: byStatus,
    totals: totals || { total_orders: 0, total_revenue: 0, total_cost: 0 },
    profit: totals ? Number(totals.total_revenue) - Number(totals.total_cost) : 0,
  });
});

router.get('/material-usage', authRequired, roleRequired('director', 'manager'), async (req, res) => {
  const { date_from = '', date_to = '' } = req.query;
  const dc = dateConditions('ml.created_at', date_from, date_to);
  const where = ["ml.action = 'consume'", ...dc.conditions].join(' AND ');
  const rows = await all(
    `SELECT m.name_ru, m.unit, COALESCE(SUM(ABS(ml.quantity)), 0) AS used
     FROM material_ledger ml
     JOIN materials m ON m.id = ml.material_id
     WHERE ${where}
     GROUP BY m.id, m.name_ru, m.unit`,
    dc.params,
  );
  res.json(rows.map(r => ({ ...r, used: Number(r.used) || 0 })));
});

router.get('/employee-stats', authRequired, roleRequired('director'), async (req, res) => {
  const { date_from = '', date_to = '' } = req.query;
  const employees = await all('SELECT id, full_name, role FROM users WHERE is_active = 1 ORDER BY full_name');

  const timeC = [];
  const timeP = [];
  if (date_from) { timeC.push('date >= ?'); timeP.push(date_from); }
  if (date_to)   { timeC.push('date <= ?'); timeP.push(date_to); }
  const timeWhere = timeC.length ? timeC.join(' AND ') : '1=1';

  const histC = [];
  const histP = [];
  if (date_from) { histC.push('created_at >= ?'); histP.push(date_from); }
  if (date_to)   { histC.push('created_at <= ?'); histP.push(date_to + ' 23:59:59'); }
  const histWhere = histC.length ? histC.join(' AND ') : '1=1';

  const att = await all(`SELECT user_id, COUNT(*)::int AS cnt FROM attendance WHERE ${timeWhere} GROUP BY user_id`, timeP);
  const attMap = Object.fromEntries(att.map(r => [r.user_id, r.cnt]));

  const hist = await all(`SELECT changed_by, COUNT(*)::int AS cnt FROM order_history WHERE ${histWhere} GROUP BY changed_by`, histP);
  const histMap = Object.fromEntries(hist.map(r => [r.changed_by, r.cnt]));

  const inc = await all(`SELECT user_id, COUNT(*)::int AS cnt FROM incidents WHERE ${histWhere} GROUP BY user_id`, histP);
  const incMap = Object.fromEntries(inc.map(r => [r.user_id, r.cnt]));

  res.json(employees.map(e => ({
    id: e.id, full_name: e.full_name, role: e.role,
    days_worked: attMap[e.id] || 0,
    tasks_done: histMap[e.id] || 0,
    incidents: incMap[e.id] || 0,
  })));
});

async function buildFinanceData(date_from, date_to) {
  const dc = dateConditions('created_at', date_from, date_to);
  const where = ["status != 'cancelled'", ...dc.conditions].join(' AND ');

  const totals = await one(
    `SELECT COUNT(*)::int AS orders_count,
            COALESCE(SUM(total_price), 0) AS revenue,
            COALESCE(SUM(material_cost), 0) AS material_cost
     FROM orders WHERE ${where}`,
    dc.params,
  );

  const penC = [];
  const penP = [];
  if (date_from) { penC.push('created_at >= ?'); penP.push(date_from); }
  if (date_to)   { penC.push('created_at <= ?'); penP.push(date_to + ' 23:59:59'); }
  const penWhere = ['1=1', ...penC].join(' AND ');
  const penalties = await one(
    `SELECT COALESCE(SUM(deduction_amount), 0) AS total_penalties FROM incidents WHERE ${penWhere} AND deduction_amount > 0`,
    penP,
  );

  const payC = [];
  const payP = [];
  if (date_from) { payC.push('week_start >= ?'); payP.push(date_from); }
  if (date_to)   { payC.push('week_end <= ?'); payP.push(date_to); }
  const payWhere = ['1=1', ...payC].join(' AND ');
  const payrollTotal = await one(
    `SELECT COALESCE(SUM(total), 0) AS total_payroll FROM payroll WHERE ${payWhere}`,
    payP,
  );

  const daily = await all(
    `SELECT DATE(created_at)::text AS day,
            COUNT(*)::int AS orders_count,
            COALESCE(SUM(total_price), 0) AS revenue,
            COALESCE(SUM(material_cost), 0) AS cost
     FROM orders WHERE ${where}
     GROUP BY DATE(created_at)
     ORDER BY day DESC
     LIMIT 31`,
    dc.params,
  );

  const topServicesParts = ["o.status != 'cancelled'"];
  const topServicesParams = [];
  if (date_from) { topServicesParts.push('o.created_at >= ?'); topServicesParams.push(date_from); }
  if (date_to)   { topServicesParts.push('o.created_at <= ?'); topServicesParams.push(date_to + ' 23:59:59'); }
  const topServices = await all(
    `SELECT s.name_ru, COUNT(oi.id)::int AS order_count, COALESCE(SUM(oi.total), 0) AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN services s ON s.id = oi.service_id
     WHERE ${topServicesParts.join(' AND ')}
     GROUP BY s.id, s.name_ru
     ORDER BY revenue DESC
     LIMIT 5`,
    topServicesParams,
  );

  const revenue = Number(totals?.revenue || 0);
  const materialCost = Number(totals?.material_cost || 0);
  const payrollSum = Number(payrollTotal?.total_payroll || 0);
  const penaltiesSum = Number(penalties?.total_penalties || 0);

  return {
    revenue,
    material_cost: materialCost,
    payroll: payrollSum,
    penalties: penaltiesSum,
    profit: revenue - materialCost - payrollSum,
    orders_count: totals?.orders_count || 0,
    daily,
    top_services: topServices,
  };
}

router.get('/finance', authRequired, roleRequired('director'), async (req, res) => {
  res.json(await buildFinanceData(req.query.date_from || '', req.query.date_to || ''));
});

router.get('/finance-export.csv', authRequired, roleRequired('director'), async (req, res) => {
  const { date_from = '', date_to = '' } = req.query;
  const data = await buildFinanceData(date_from, date_to);

  const lines = [];
  const row = (...cols) => lines.push(cols.map(c => String(c ?? '').replace(/;/g, ',')).join(';'));
  row('Отчёт', 'Финансы директора');
  row('Период', `${date_from || '-'} — ${date_to || '-'}`);
  row('');
  row('Сводка', 'Сумма');
  row('Выручка', data.revenue);
  row('Материалы', data.material_cost);
  row('Зарплаты', data.payroll);
  row('Штрафы', data.penalties);
  row('Прибыль', data.profit);
  row('Заказов', data.orders_count);
  row('');
  row('Динамика по дням');
  row('Дата', 'Заказов', 'Доход', 'Расход');
  for (const d of data.daily) row(d.day, d.orders_count, d.revenue, d.cost);
  row('');
  row('Топ услуг');
  row('Услуга', 'Кол-во', 'Доход');
  for (const s of data.top_services) row(s.name_ru, s.order_count, s.revenue);

  const csv = '﻿' + lines.join('\r\n');
  const filename = `finance_${date_from || 'all'}_${date_to || 'all'}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(csv);
});

export default router;
