import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatCurrency, roleLabel } from '../lib/utils.js';

const isoDay = (delta = 0) => new Date(Date.now() + delta * 86400000).toISOString().split('T')[0];

const dayCell = (day) => {
  if (day.status === 'worked') return { text: `${day.hours}ч`, cls: 'wj-day-worked', title: 'Отработано' };
  if (day.status === 'leave') return { text: day.leave_type === 'sick' ? 'В(Б)' : 'В(О)', cls: 'wj-day-leave', title: 'Выходной по заявке' };
  if (day.status === 'conflict') return { text: 'К', cls: 'wj-day-conflict', title: 'Конфликт: и смена, и заявка' };
  if (day.status === 'absent') return { text: 'Н', cls: 'wj-day-absent', title: 'Не пришёл' };
  return { text: '-', cls: 'wj-day-weekend', title: 'Выходной день' };
};

export default function WorkJournal() {
  const { lang } = useAuth();
  const [period, setPeriod] = useState('week');
  const [from, setFrom] = useState(isoDay(-6));
  const [to, setTo] = useState(isoDay(0));
  const [userId, setUserId] = useState('');
  const [sortBy, setSortBy] = useState('hours');
  const [sortDir, setSortDir] = useState('desc');
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const setPeriodMode = (mode) => {
    setPeriod(mode);
    if (mode === 'week') { setFrom(isoDay(-6)); setTo(isoDay(0)); }
    else { setFrom(isoDay(-29)); setTo(isoDay(0)); }
  };

  const load = useCallback(async () => {
    setData(null); setError(false);
    try {
      const q = new URLSearchParams({ date_from: from, date_to: to, sort_by: sortBy, sort_dir: sortDir });
      if (userId) q.set('user_id', userId);
      const result = await api.get(`/api/work-journal?${q.toString()}`);
      setData(result || { items: [], period: { days: [] }, insights: {} });
    } catch { setError(true); }
  }, [from, to, sortBy, sortDir, userId]);

  // Auto-reload only when period preset changes; otherwise the user clicks "Загрузить"
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period]);

  const items = data?.items || [];
  const days = data?.period?.days || [];
  const insights = data?.insights || {};
  const { most_hours, most_fines, best_tasks } = insights;

  return (
    <>
      <div className="page-header"><h1 className="page-title">Журнал работы</h1><div></div></div>
      <div className="px-4 space-y-4 pb-8">
        <div className="card">
          <div className="period-selector mb-3">
            <button className={`period-btn ${period === 'week' ? 'active' : ''}`} onClick={() => setPeriodMode('week')}>Неделя</button>
            <button className={`period-btn ${period === 'month' ? 'active' : ''}`} onClick={() => setPeriodMode('month')}>Месяц</button>
          </div>
          <div className="reports-filter-grid mb-3">
            <div>
              <label className="input-label">С</label>
              <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="input-label">По</label>
              <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <div>
              <label className="input-label">Сотрудник</label>
              <select className="input" value={userId} onChange={e => setUserId(e.target.value)}>
                <option value="">Все</option>
                {items.map(row => <option key={row.user_id} value={row.user_id}>{row.full_name} (#{row.user_id})</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Сортировка</label>
              <select className="input" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="hours">По часам</option>
                <option value="fines">По штрафам</option>
                <option value="tasks">По задачам</option>
              </select>
            </div>
            <div>
              <label className="input-label">Порядок</label>
              <select className="input" value={sortDir} onChange={e => setSortDir(e.target.value)}>
                <option value="desc">По убыванию</option>
                <option value="asc">По возрастанию</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={load}>Загрузить</button>
          </div>
        </div>

        {data && items.length > 0 && (
          <div>
            <div className="reports-kpi-grid">
              <div className="report-kpi report-kpi-orders">
                <div className="report-kpi-label">Больше часов</div>
                <div className="font-bold mt-1">{most_hours ? `${most_hours.full_name} (${most_hours.value}ч)` : '—'}</div>
              </div>
              <div className="report-kpi report-kpi-revenue">
                <div className="report-kpi-label">Больше штрафов</div>
                <div className="font-bold mt-1">{most_fines ? `${most_fines.full_name} (${formatCurrency(most_fines.value, lang)})` : '—'}</div>
              </div>
              <div className="report-kpi report-kpi-profit">
                <div className="report-kpi-label">Лучший по задачам</div>
                <div className="font-bold mt-1">{best_tasks ? `${best_tasks.full_name} (${best_tasks.value})` : '—'}</div>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="reports-table-wrap">
            {error ? <div className="text-center text-red-500 py-8">Ошибка загрузки журнала</div>
              : data === null ? <div className="flex justify-center py-8"><div className="spinner"></div></div>
              : items.length === 0 ? <div className="text-center text-gray-400 py-8">Нет данных за выбранный период</div>
              : (
                <table className="wj-table">
                  <thead>
                    <tr>
                      <th className="wj-user-col">Сотрудник</th>
                      <th>Часы</th>
                      <th>Не пришёл</th>
                      <th>Штрафы</th>
                      <th>Задачи</th>
                      {days.map(d => <th key={d} className="wj-day-head">{d.slice(5)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(row => (
                      <tr key={row.user_id}>
                        <td className="wj-user-col">
                          <div className="font-medium">{row.full_name}</div>
                          <div className="text-xs text-gray-400">#{row.user_id} • {roleLabel(row.role, lang)}</div>
                        </td>
                        <td className="text-center">{row.total_hours}</td>
                        <td className="text-center">{row.absent_days}</td>
                        <td className="text-center">{row.fines_count} / {formatCurrency(row.fines_sum, lang)}</td>
                        <td className="text-center">{row.tasks_done_count}</td>
                        {(row.days || []).map((d, i) => {
                          const v = dayCell(d);
                          return <td key={i} className={`wj-day ${v.cls}`} title={v.title}>{v.text}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </div>
      </div>
    </>
  );
}
