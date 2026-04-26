import { Router } from 'express';
import { all } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

const MAX_RANGE_DAYS = 93;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value, field) {
  if (!ISO_DATE.test(String(value || ''))) {
    const e = new Error(`Некорректная дата: ${field}`);
    e.statusCode = 400; throw e;
  }
  return new Date(value + 'T00:00:00Z');
}
function toIso(d) { return d.toISOString().split('T')[0]; }
function dayList(from, to) {
  const out = [];
  for (let d = new Date(from.getTime()); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(toIso(d));
  }
  return out;
}
function isWeekday(isoDay) {
  const d = new Date(isoDay + 'T00:00:00Z').getUTCDay();
  return d !== 0 && d !== 6;
}
function calcHours(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(String(checkIn).replace(' ', 'T'));
  const b = new Date(String(checkOut).replace(' ', 'T'));
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round(((b - a) / 3600000) * 100) / 100);
}

router.get('/', authRequired, async (req, res, next) => {
  try {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const dateFrom = req.query.date_from || '';
    const dateTo = req.query.date_to || '';
    let fromD, toD;
    if (dateFrom && dateTo) { fromD = parseDate(dateFrom, 'date_from'); toD = parseDate(dateTo, 'date_to'); }
    else if (dateFrom)      { fromD = parseDate(dateFrom, 'date_from'); toD = today; }
    else if (dateTo)        { toD = parseDate(dateTo, 'date_to'); fromD = new Date(toD.getTime()); fromD.setUTCDate(fromD.getUTCDate() - 29); }
    else                    { toD = today; fromD = new Date(toD.getTime()); fromD.setUTCDate(fromD.getUTCDate() - 29); }

    if (fromD > toD) return res.status(400).json({ detail: 'date_from не может быть больше date_to' });
    if (Math.round((toD - fromD) / 86400000) + 1 > MAX_RANGE_DAYS) {
      return res.status(400).json({ detail: `Максимальный диапазон: ${MAX_RANGE_DAYS} дней` });
    }

    const fromIso = toIso(fromD);
    const toIsoStr = toIso(toD);
    const toTs = `${toIsoStr} 23:59:59`;
    const days = dayList(fromD, toD);

    const conditions = ['is_active = 1'];
    const params = [];
    const userId = parseInt(req.query.user_id || '0', 10);
    if (userId) { conditions.push('id = ?'); params.push(userId); }
    const users = await all(
      `SELECT id, full_name, role FROM users WHERE ${conditions.join(' AND ')} ORDER BY full_name`,
      params,
    );

    if (users.length === 0) {
      return res.json({
        period: { date_from: fromIso, date_to: toIsoStr, days },
        items: [],
        insights: { most_hours: null, most_fines: null, best_tasks: null },
      });
    }

    const userIds = users.map(u => u.id);
    const placeholders = userIds.map(() => '?').join(',');

    const attendance = await all(
      `SELECT user_id, date, check_in, check_out FROM attendance
       WHERE user_id IN (${placeholders}) AND date BETWEEN ? AND ?`,
      [...userIds, fromIso, toIsoStr],
    );
    const attendanceMap = new Map();
    for (const r of attendance) attendanceMap.set(`${r.user_id}_${r.date}`, r);

    const fines = await all(
      `SELECT user_id, COUNT(*)::int AS fines_count, COALESCE(SUM(deduction_amount), 0) AS fines_sum
       FROM incidents
       WHERE user_id IN (${placeholders}) AND deduction_amount > 0 AND created_at BETWEEN ? AND ?
       GROUP BY user_id`,
      [...userIds, fromIso, toTs],
    );
    const fineMap = Object.fromEntries(fines.map(r => [r.user_id, { fines_count: r.fines_count, fines_sum: Number(r.fines_sum) || 0 }]));

    const tasksDone = await all(
      `SELECT assigned_to AS user_id, COUNT(*)::int AS tasks_done_count
       FROM tasks
       WHERE assigned_to IN (${placeholders}) AND is_done = 1 AND done_at IS NOT NULL AND done_at BETWEEN ? AND ?
       GROUP BY assigned_to`,
      [...userIds, fromIso, toTs],
    );
    const taskMap = Object.fromEntries(tasksDone.map(r => [r.user_id, r.tasks_done_count]));

    const leaves = await all(
      `SELECT user_id, type, date_start, date_end FROM leave_requests
       WHERE user_id IN (${placeholders}) AND status = 'approved'
         AND date_start <= ? AND date_end >= ?`,
      [...userIds, toIsoStr, fromIso],
    );
    const leaveDays = {};
    for (const uid of userIds) leaveDays[uid] = {};
    for (const row of leaves) {
      const start = new Date(Math.max(parseDate(row.date_start, 'date_start').getTime(), fromD.getTime()));
      const end = new Date(Math.min(parseDate(row.date_end, 'date_end').getTime(), toD.getTime()));
      for (const dayIso of dayList(start, end)) leaveDays[row.user_id][dayIso] = row.type;
    }

    const items = users.map(u => {
      const uid = u.id;
      let totalHours = 0, absentDays = 0, workedDays = 0, leaveCount = 0, conflictDays = 0;
      const daily = days.map(dayIso => {
        const a = attendanceMap.get(`${uid}_${dayIso}`);
        const leaveType = leaveDays[uid]?.[dayIso];
        let status, hours = 0;
        if (a) {
          hours = calcHours(a.check_in, a.check_out);
          totalHours += hours;
          workedDays++;
          if (leaveType) { status = 'conflict'; conflictDays++; }
          else status = 'worked';
        } else if (leaveType) { status = 'leave'; leaveCount++; }
        else if (isWeekday(dayIso)) { status = 'absent'; absentDays++; }
        else status = 'weekend';
        return { date: dayIso, status, hours, leave_type: status === 'leave' || status === 'conflict' ? leaveType : null };
      });
      const f = fineMap[uid] || { fines_count: 0, fines_sum: 0 };
      return {
        user_id: uid, full_name: u.full_name, role: u.role,
        total_hours: Math.round(totalHours * 100) / 100,
        worked_days: workedDays, absent_days: absentDays,
        leave_days: leaveCount, conflict_days: conflictDays,
        fines_count: f.fines_count, fines_sum: Math.round(f.fines_sum * 100) / 100,
        tasks_done_count: taskMap[uid] || 0,
        days: daily,
      };
    });

    const sortBy = req.query.sort_by;
    const reverse = String(req.query.sort_dir || 'desc').toLowerCase() !== 'asc';
    const keyMap = { hours: 'total_hours', fines: 'fines_sum', tasks: 'tasks_done_count' };
    if (keyMap[sortBy]) {
      const k = keyMap[sortBy];
      items.sort((a, b) => reverse ? b[k] - a[k] : a[k] - b[k]);
    } else {
      items.sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'));
    }

    const topBy = (field) => {
      if (items.length === 0) return null;
      const top = items.reduce((m, x) => x[field] > m[field] ? x : m);
      return { user_id: top.user_id, full_name: top.full_name, role: top.role, value: top[field] };
    };

    res.json({
      period: { date_from: fromIso, date_to: toIsoStr, days },
      items,
      insights: {
        most_hours: topBy('total_hours'),
        most_fines: topBy('fines_sum'),
        best_tasks: topBy('tasks_done_count'),
      },
    });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ detail: e.message });
    next(e);
  }
});

export default router;
