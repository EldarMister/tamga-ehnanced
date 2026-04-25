import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatCurrency, formatDateTime, roleLabel } from '../lib/utils.js';

export default function Fines() {
  const { lang } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [userId, setUserId] = useState(0);
  const [users, setUsers] = useState([]);
  const [fines, setFines] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get('/api/users').then(u => setUsers((u || []).filter(x => x.role !== 'director'))).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setFines(null); setError(false);
    try {
      const q = new URLSearchParams({ penalties_only: '1', date_from: from, date_to: to });
      if (userId > 0) q.set('user_id', String(userId));
      const data = await api.get(`/api/hr/incidents?${q.toString()}`);
      setFines(data || []);
    } catch { setError(true); }
  }, [from, to, userId]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const total = (fines || []).reduce((sum, f) => sum + (Number(f.deduction_amount) || 0), 0);

  return (
    <>
      <div className="page-header"><h1 className="page-title">Журнал штрафов</h1><div></div></div>
      <div className="px-4 space-y-4 pb-8">
        <div className="card">
          <div className="reports-filter-grid mb-4">
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
              <select className="input" value={userId} onChange={e => setUserId(Number(e.target.value))}>
                <option value="0">Все сотрудники</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({roleLabel(u.role, lang)})</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={load}>Показать</button>
          </div>
        </div>
        <div>
          {error ? <div className="text-center text-red-500 py-8">Ошибка загрузки журнала штрафов</div>
            : fines === null ? <div className="flex justify-center py-8"><div className="spinner"></div></div>
            : fines.length === 0 ? <div className="text-center text-gray-400 py-8">Штрафов за выбранный период нет</div>
            : (
              <>
                <div className="card mb-4">
                  <div className="reports-kpi-grid">
                    <div className="report-kpi report-kpi-orders">
                      <div className="report-kpi-value">{fines.length}</div>
                      <div className="report-kpi-label">Штрафов</div>
                    </div>
                    <div className="report-kpi report-kpi-profit">
                      <div className="report-kpi-value">{formatCurrency(total, lang)}</div>
                      <div className="report-kpi-label">Сумма удержаний</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  {fines.map(f => (
                    <div key={f.id} className="card">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold">{f.employee_name}</div>
                          <div className="text-xs text-gray-400">{formatDateTime(f.created_at, lang)} • {f.created_by_name}</div>
                        </div>
                        <div className="badge" style={{ background: 'var(--danger-light)', color: 'var(--danger)', fontWeight: 700 }}>
                          {formatCurrency(f.deduction_amount || 0, lang)}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500 mt-2">{f.description}</div>
                      <div className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Тип: {f.type}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
        </div>
      </div>
    </>
  );
}
