import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatDate, formatDateTime, roleLabel } from '../lib/utils.js';
import { useRealtime } from '../lib/useRealtime.js';

const todayIso = () => new Date().toISOString().split('T')[0];
const typeLabel = (t) => t === 'sick' ? 'Больничный' : 'Отдых';

function StatusBadge({ status }) {
  if (status === 'approved') return <span className="badge bg-green-100 text-green-700">Одобрено</span>;
  if (status === 'rejected') return <span className="badge bg-red-50 text-red-700">Отклонено</span>;
  return <span className="badge bg-yellow-100 text-yellow-700">Ожидает</span>;
}

export default function LeaveRequests() {
  const { user, lang } = useAuth();
  const showToast = useToast();
  const canManage = ['director', 'manager'].includes(user.role);

  const [users, setUsers] = useState([]);
  const [type, setType] = useState('sick');
  const [reason, setReason] = useState('');
  const [dateMode, setDateMode] = useState('range');
  const [dateStart, setDateStart] = useState(todayIso());
  const [dateEnd, setDateEnd] = useState(todayIso());
  const [days, setDays] = useState(1);
  const [formUser, setFormUser] = useState(String(user.id));

  const [statusFilter, setStatusFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [list, setList] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    api.get('/api/users').then(rows => setUsers((rows || []).filter(u => u.is_active))).catch(() => setUsers([]));
  }, [canManage]);

  const load = useCallback(async () => {
    setList(null); setError(false);
    try {
      const q = new URLSearchParams({ limit: '100', offset: '0' });
      if (statusFilter) q.set('status', statusFilter);
      if (canManage && userFilter) q.set('user_id', userFilter);
      api.clearCache('/api/leave-requests');
      const data = await api.get(`/api/leave-requests?${q.toString()}`);
      const items = Array.isArray(data) ? data : (data?.items || []);
      setList(items);
    } catch { setError(true); }
  }, [statusFilter, userFilter, canManage]);

  useEffect(() => { load(); }, [load]);
  useRealtime('leave:changed', load);

  const submit = async () => {
    if (!reason.trim()) { showToast('Укажите причину', 'warning'); return; }
    const payload = { type, reason: reason.trim(), date_start: dateStart };
    if (canManage && formUser) payload.user_id = parseInt(formUser, 10);
    if (dateMode === 'days') {
      const d = parseInt(days, 10) || 0;
      if (d < 1) { showToast('Количество дней должно быть больше 0', 'warning'); return; }
      payload.days_count = d;
    } else {
      payload.date_end = dateEnd;
    }
    try {
      await api.post('/api/leave-requests', payload);
      showToast('Заявка отправлена', 'success');
      setReason('');
      load();
    } catch {}
  };

  const review = async (id, status) => {
    try {
      await api.patch(`/api/leave-requests/${id}/status`, { status });
      showToast(status === 'approved' ? 'Заявка одобрена' : 'Заявка отклонена', 'success');
      load();
    } catch {}
  };

  return (
    <>
      <div className="page-header"><h1 className="page-title">Отпуск / Больничный</h1><div></div></div>
      <div className="px-4 space-y-4 pb-8">
        <div className="card">
          <h3 className="font-bold mb-3">Новая заявка</h3>
          <div className="space-y-3">
            {canManage && (
              <div>
                <label className="input-label">Сотрудник</label>
                <select className="input" value={formUser} onChange={e => setFormUser(e.target.value)}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({roleLabel(u.role, lang)})</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="input-label">Тип</label>
              <select className="input" value={type} onChange={e => setType(e.target.value)}>
                <option value="sick">Больничный</option>
                <option value="rest">Отдых</option>
              </select>
            </div>
            <div>
              <label className="input-label">Причина</label>
              <textarea className="input" rows="3" placeholder="Опишите причину..." value={reason} onChange={e => setReason(e.target.value)}></textarea>
            </div>
            <div>
              <label className="input-label">Режим дат</label>
              <select className="input" value={dateMode} onChange={e => setDateMode(e.target.value)}>
                <option value="range">Начало + конец</option>
                <option value="days">Начало + количество дней</option>
              </select>
            </div>
            <div className="reports-filter-grid">
              <div>
                <label className="input-label">Дата начала</label>
                <input type="date" className="input" value={dateStart} onChange={e => setDateStart(e.target.value)} />
              </div>
              {dateMode === 'range' ? (
                <div>
                  <label className="input-label">Дата конца</label>
                  <input type="date" className="input" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
                </div>
              ) : (
                <div>
                  <label className="input-label">Дней</label>
                  <input type="number" className="input" min="1" value={days} onChange={e => setDays(e.target.value)} />
                </div>
              )}
              <button className="btn btn-primary" onClick={submit}>Отправить</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="reports-filter-grid mb-3">
            <div>
              <label className="input-label">Статус</label>
              <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">Все</option>
                <option value="pending">Ожидает</option>
                <option value="approved">Одобрено</option>
                <option value="rejected">Отклонено</option>
              </select>
            </div>
            {canManage && (
              <div>
                <label className="input-label">Сотрудник</label>
                <select className="input" value={userFilter} onChange={e => setUserFilter(e.target.value)}>
                  <option value="">Все</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({roleLabel(u.role, lang)})</option>)}
                </select>
              </div>
            )}
            <button className="btn btn-secondary" onClick={load}>Обновить</button>
          </div>
          <div>
            {error ? <div className="text-center text-red-500 py-8">Ошибка загрузки заявок</div>
              : list === null ? <div className="flex justify-center py-8"><div className="spinner"></div></div>
              : list.length === 0 ? <div className="text-center text-gray-400 py-8">Заявок нет</div>
              : list.map(row => {
                const canApprove = canManage && row.status === 'pending' && row.user_id !== user.id;
                return (
                  <div key={row.id} className="py-3 border-b last:border-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <div className="font-medium">{row.user_name} <span className="text-gray-400">#{row.user_id}</span></div>
                        <div className="text-xs text-gray-400">{typeLabel(row.type)} • {formatDate(row.date_start, lang)} — {formatDate(row.date_end, lang)} ({row.days_count} дн.)</div>
                      </div>
                      <StatusBadge status={row.status} />
                    </div>
                    <div className="text-sm text-gray-600 mb-2">{row.reason}</div>
                    <div className="text-xs text-gray-400">
                      Создано: {row.created_by_name || '—'} • {formatDateTime(row.created_at, lang)}
                      {row.reviewed_by_name && <><br />Рассмотрел: {row.reviewed_by_name}{row.reviewed_at ? ` • ${formatDateTime(row.reviewed_at, lang)}` : ''}</>}
                    </div>
                    {canApprove && (
                      <div className="flex gap-2 mt-2">
                        <button className="btn btn-success btn-sm" onClick={() => review(row.id, 'approved')}>Одобрить</button>
                        <button className="btn btn-danger btn-sm" onClick={() => review(row.id, 'rejected')}>Отклонить</button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </>
  );
}
