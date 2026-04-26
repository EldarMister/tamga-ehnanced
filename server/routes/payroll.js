import { Router } from 'express';
import { one, all, exec } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';
import { broadcastTo } from '../realtime.js';

const router = Router();

router.get('/', authRequired, roleRequired('director'), async (req, res) => {
  const targetStart = req.query.month_start || req.query.week_start;
  if (targetStart) {
    const rows = await all(
      `SELECT p.*, u.full_name, u.role FROM payroll p
       JOIN users u ON u.id = p.user_id
       WHERE p.week_start = ?
       ORDER BY u.full_name`,
      [targetStart],
    );
    return res.json(rows);
  }
  const rows = await all(
    `SELECT p.*, u.full_name, u.role FROM payroll p
     JOIN users u ON u.id = p.user_id
     ORDER BY p.week_start DESC, u.full_name LIMIT 50`,
  );
  res.json(rows);
});

async function periodReport(periodStart, periodEnd) {
  const employees = await all("SELECT * FROM users WHERE is_active = 1 AND role != 'director' ORDER BY full_name");
  const periodEndTs = `${periodEnd} 23:59:59`;

  const att = await all('SELECT user_id, COUNT(*)::int AS cnt FROM attendance WHERE date BETWEEN ? AND ? GROUP BY user_id', [periodStart, periodEnd]);
  const attMap = Object.fromEntries(att.map(r => [r.user_id, r.cnt]));

  const design = await all("SELECT changed_by, COUNT(*)::int AS cnt FROM order_history WHERE new_status = 'design_done' AND created_at BETWEEN ? AND ? GROUP BY changed_by", [periodStart, periodEndTs]);
  const designMap = Object.fromEntries(design.map(r => [r.changed_by, r.cnt]));

  const prod = await all("SELECT changed_by, COUNT(*)::int AS cnt FROM order_history WHERE new_status IN ('printed','ready') AND created_at BETWEEN ? AND ? GROUP BY changed_by", [periodStart, periodEndTs]);
  const prodMap = Object.fromEntries(prod.map(r => [r.changed_by, r.cnt]));

  const allHist = await all("SELECT changed_by, COUNT(*)::int AS cnt FROM order_history WHERE created_at BETWEEN ? AND ? GROUP BY changed_by", [periodStart, periodEndTs]);
  const allHistMap = Object.fromEntries(allHist.map(r => [r.changed_by, r.cnt]));

  const incidents = await all('SELECT * FROM incidents WHERE created_at BETWEEN ? AND ?', [periodStart, periodEndTs]);
  const incidentsByUser = {};
  for (const i of incidents) (incidentsByUser[i.user_id] ??= []).push(i);

  const payrollRows = await all('SELECT * FROM payroll WHERE week_start = ?', [periodStart]);
  const payrollMap = Object.fromEntries(payrollRows.map(r => [r.user_id, r]));

  return employees.map(emp => {
    const uid = emp.id;
    let tasks;
    if (emp.role === 'designer') tasks = designMap[uid] || 0;
    else if (emp.role === 'master' || emp.role === 'assistant') tasks = prodMap[uid] || 0;
    else tasks = allHistMap[uid] || 0;

    const userIncidents = incidentsByUser[uid] || [];
    const penaltiesTotal = userIncidents.reduce((s, i) => s + (Number(i.deduction_amount) || 0), 0);
    return {
      employee: emp,
      days_worked: attMap[uid] || 0,
      tasks_done: tasks,
      incidents: userIncidents,
      penalties_total: penaltiesTotal,
      payroll: payrollMap[uid] || null,
    };
  });
}

router.get('/month-report', authRequired, roleRequired('director'), async (req, res) => {
  const { month_start, month_end } = req.query;
  if (!month_start || !month_end) return res.status(400).json({ detail: 'Нужны month_start и month_end' });
  res.json(await periodReport(month_start, month_end));
});

router.get('/week-report', authRequired, roleRequired('director'), async (req, res) => {
  const { week_start, week_end } = req.query;
  if (!week_start || !week_end) return res.status(400).json({ detail: 'Нужны week_start и week_end' });
  res.json(await periodReport(week_start, week_end));
});

router.post('/', authRequired, roleRequired('director'), async (req, res) => {
  const data = req.body || {};
  const periodStart = data.month_start || data.week_start;
  const periodEnd = data.month_end || data.week_end;
  if (!periodStart || !periodEnd) return res.status(400).json({ detail: 'Нужны month_start и month_end' });

  const base = Number(data.base_salary) || 0;
  const bonus = Number(data.bonus) || 0;
  const ded = Number(data.deductions) || 0;
  const total = base + bonus - ded;

  const existing = await one('SELECT * FROM payroll WHERE user_id = ? AND week_start = ?', [data.user_id, periodStart]);
  let payrollId;
  if (existing) {
    await exec(
      'UPDATE payroll SET base_salary = ?, bonus = ?, deductions = ?, total = ?, note = ?, week_end = ? WHERE id = ?',
      [base, bonus, ded, total, data.note || '', periodEnd, existing.id],
    );
    payrollId = existing.id;
  } else {
    const r = await exec(
      `INSERT INTO payroll (user_id, week_start, week_end, base_salary, bonus, deductions, total, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [data.user_id, periodStart, periodEnd, base, bonus, ded, total, data.note || '', req.user.id],
    );
    payrollId = r.rows[0].id;
  }
  const row = await one('SELECT * FROM payroll WHERE id = ?', [payrollId]);
  res.json(row);
});

router.patch('/:id/pay', authRequired, roleRequired('director'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await one('SELECT * FROM payroll WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ detail: 'Запись не найдена' });
  await exec('UPDATE payroll SET is_paid = 1, paid_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  const updated = await one('SELECT * FROM payroll WHERE id = ?', [id]);
  broadcastTo(updated.user_id, 'payroll:paid', { id });
  res.json(updated);
});

export default router;
