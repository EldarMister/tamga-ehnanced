import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useModal } from '../components/Modal.jsx';
import { roleLabel } from '../lib/utils.js';

export default function Users() {
  const { lang } = useAuth();
  const showToast = useToast();
  const { showForm, showConfirm } = useModal();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      api.clearCache('/api/users');
      const data = await api.get('/api/users');
      setUsers(data || []);
    } catch { setError(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const showAddUser = () => showForm({
    title: 'Новый сотрудник',
    fields: [
      { name: 'full_name', label: 'ФИО', type: 'text', required: true },
      { name: 'username', label: 'Логин', type: 'text', required: true },
      { name: 'password', label: 'Пароль', type: 'text', required: true, value: '12345' },
      { name: 'role', label: 'Роль', type: 'select', options: [
        { value: 'manager', label: 'Менеджер' }, { value: 'designer', label: 'Дизайнер' },
        { value: 'master', label: 'Мастер' }, { value: 'assistant', label: 'Помощник' }] },
      { name: 'phone', label: 'Телефон', type: 'tel', placeholder: '+996...' },
    ],
    submitText: 'Создать',
    onSubmit: async (data) => {
      try { await api.post('/api/users', data); showToast('Сотрудник создан', 'success'); load(); } catch {}
    },
  });

  const assignTask = (u) => showForm({
    title: `Задача: ${u.full_name}`,
    fields: [
      { name: 'title', label: 'Название', type: 'text', required: true, placeholder: 'Что нужно сделать?' },
      { name: 'description', label: 'Описание', type: 'textarea', placeholder: 'Подробности...' },
      { name: 'type', label: 'Тип', type: 'select', options: [
        { value: 'daily', label: '📅 Дневная задача' }, { value: 'weekly', label: '📆 Недельная задача' }] },
      { name: 'due_date', label: 'Срок', type: 'date' },
    ],
    submitText: 'Назначить',
    onSubmit: async (data) => {
      try {
        await api.post('/api/tasks', { title: data.title, description: data.description || '', type: data.type || 'daily', assigned_to: u.id, due_date: data.due_date || null });
        showToast('Задача назначена', 'success');
      } catch {}
    },
  });

  const fine = (u) => showForm({
    title: `Штраф: ${u.full_name}`,
    fields: [
      { name: 'type', label: 'Причина', type: 'select', options: [
        { value: 'late', label: 'Опоздание' }, { value: 'defect', label: 'Брак' },
        { value: 'complaint', label: 'Жалоба' }, { value: 'other', label: 'Прочее' }] },
      { name: 'description', label: 'Комментарий', type: 'textarea', required: true, placeholder: 'За что назначен штраф...' },
      { name: 'deduction_amount', label: 'Сумма штрафа', type: 'number', required: true, step: '100', placeholder: '0' },
    ],
    submitText: 'Штрафовать',
    onSubmit: async (data) => {
      const amount = parseFloat(data.deduction_amount);
      if (!Number.isFinite(amount) || amount <= 0) { showToast('Введите корректную сумму штрафа', 'warning'); return; }
      try {
        await api.post('/api/hr/incidents', { user_id: u.id, type: data.type || 'other', description: data.description, deduction_amount: amount });
        showToast('Штраф сохранён', 'success');
      } catch {}
    },
  });

  const toggleActive = (u) => {
    showConfirm({
      title: u.is_active ? 'Деактивировать?' : 'Активировать?',
      body: u.is_active ? 'Сотрудник не сможет войти в систему' : 'Восстановить доступ?',
      danger: u.is_active,
      onConfirm: async () => { try { await api.patch(`/api/users/${u.id}/active`); showToast('Статус обновлён', 'success'); load(); } catch {} },
    });
  };

  const resetPass = (u) => {
    showConfirm({
      title: 'Сброс пароля', body: 'Пароль будет сброшен на "12345"', confirmText: 'Сбросить',
      onConfirm: async () => { try { await api.post(`/api/users/${u.id}/reset-password`); showToast('Пароль сброшен на 12345', 'success'); } catch {} },
    });
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Сотрудники</h1>
        <button className="btn btn-primary btn-sm" onClick={showAddUser}>+ Добавить</button>
      </div>
      <div className="px-4 space-y-3 pb-8">
        {error ? <div className="text-center text-red-500 py-8">Ошибка</div>
          : users === null ? <div className="flex justify-center py-8"><div className="spinner"></div></div>
          : users.length === 0 ? <div className="text-center text-gray-400 py-8">Нет сотрудников</div>
          : users.map(u => {
            const canManage = u.role !== 'director' && u.is_active;
            return (
              <div key={u.id} className="card">
                <div className="employee-row">
                  <div>
                    <div className={`font-bold ${!u.is_active ? 'text-gray-400 line-through' : ''}`}>{u.full_name}</div>
                    <div className="text-sm text-gray-500">{roleLabel(u.role, lang)} • @{u.username}</div>
                    {u.phone && <div className="text-sm text-gray-400">{u.phone}</div>}
                  </div>
                  <div className="employee-actions">
                    {canManage && <button className="btn btn-sm btn-secondary" title="Назначить задачу" onClick={() => assignTask(u)}>📅</button>}
                    {canManage && <button className="btn btn-sm btn-warning" title="Выписать штраф" onClick={() => fine(u)}>💸</button>}
                    <button className="btn btn-sm btn-secondary" onClick={() => toggleActive(u)}>{u.is_active ? '🔴' : '🟢'}</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => resetPass(u)}>🔑</button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
}
