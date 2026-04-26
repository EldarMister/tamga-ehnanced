import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useModal } from '../components/Modal.jsx';
import { formatDate, roleLabel } from '../lib/utils.js';
import { useRealtime } from '../lib/useRealtime.js';

export default function Tasks() {
  const { user, lang } = useAuth();
  const showToast = useToast();
  const { showForm, showConfirm } = useModal();
  const canManage = ['director', 'manager'].includes(user.role);

  const [filterType, setFilterType] = useState('');
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setTasks(null); setError(false);
    try {
      api.clearCache('/api/tasks');
      const data = await api.get(`/api/tasks?type=${filterType}`);
      setTasks(data || []);
    } catch { setError(true); }
  }, [filterType]);

  useEffect(() => { load(); }, [load]);
  useRealtime('tasks:changed', load);

  const toggleDone = async (id) => {
    try { await api.patch(`/api/tasks/${id}/done`); load(); } catch {}
  };

  const remove = (id) => {
    showConfirm({
      title: 'Удалить задачу?', body: 'Задача будет удалена', danger: true, confirmText: 'Удалить',
      onConfirm: async () => {
        try { await api.delete(`/api/tasks/${id}`); showToast('Задача удалена', 'success'); load(); } catch {}
      },
    });
  };

  const showCreate = async () => {
    let users = [];
    try { users = await api.get('/api/users') || []; } catch {}
    const employees = users.filter(u => u.is_active);
    showForm({
      title: 'Новая задача',
      fields: [
        { name: 'title', label: 'Название', type: 'text', required: true, placeholder: 'Что нужно сделать?' },
        { name: 'description', label: 'Описание', type: 'textarea', placeholder: 'Подробности...' },
        { name: 'type', label: 'Тип', type: 'select', options: [
          { value: 'daily', label: '📅 Дневная задача' }, { value: 'weekly', label: '📆 Недельная задача' }] },
        { name: 'assigned_to', label: 'Кому', type: 'select',
          options: employees.map(u => ({ value: u.id, label: `${u.full_name} (${roleLabel(u.role, lang)})` })) },
        { name: 'due_date', label: 'Срок', type: 'date' },
      ],
      submitText: 'Создать',
      onSubmit: async (data) => {
        try {
          await api.post('/api/tasks', { ...data, assigned_to: parseInt(data.assigned_to) });
          showToast('Задача создана', 'success'); load();
        } catch {}
      },
    });
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Задачи</h1>
        {canManage && <button className="btn btn-primary btn-sm" onClick={showCreate}>+ Задача</button>}
      </div>
      <div className="px-4 space-y-4 pb-8 slide-up">
        <div className="period-selector">
          <button className={`period-btn ${filterType === '' ? 'active' : ''}`} onClick={() => setFilterType('')}>Все</button>
          <button className={`period-btn ${filterType === 'daily' ? 'active' : ''}`} onClick={() => setFilterType('daily')}>Дневные</button>
          <button className={`period-btn ${filterType === 'weekly' ? 'active' : ''}`} onClick={() => setFilterType('weekly')}>Недельные</button>
        </div>
        <div>
          {error ? <div style={{ textAlign: 'center', color: 'var(--danger)', padding: 32 }}>Ошибка</div>
            : tasks === null ? <div className="flex justify-center py-8"><div className="spinner"></div></div>
            : tasks.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                <p style={{ fontWeight: 600 }}>Нет задач</p>
              </div>
            )
            : tasks.map(t => (
              <div key={t.id} className="task-item">
                <div className={`task-checkbox ${t.is_done ? 'checked' : ''}`} onClick={() => toggleDone(t.id)}></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, ...(t.is_done ? { textDecoration: 'line-through', color: 'var(--text-tertiary)' } : { color: 'var(--text-primary)' }) }}>{t.title}</div>
                  {t.description && <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>{t.description}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <span className="badge" style={{ background: t.type === 'daily' ? 'var(--accent-light)' : 'var(--purple-light)', color: t.type === 'daily' ? 'var(--accent)' : 'var(--purple)' }}>
                      {t.type === 'daily' ? '📅 Дневная' : '📆 Недельная'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>→ {t.assigned_name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Поставил: {t.assigned_by_name || '—'}</span>
                    {t.due_date && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>до {formatDate(t.due_date, lang)}</span>}
                  </div>
                </div>
                {canManage && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => remove(t.id)}>✕</button>}
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
