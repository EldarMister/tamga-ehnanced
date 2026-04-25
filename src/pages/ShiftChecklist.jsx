import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';

const ROLES = [
  { value: 'manager', label: 'Менеджер' },
  { value: 'designer', label: 'Дизайнер' },
  { value: 'master', label: 'Печатник' },
  { value: 'assistant', label: 'Помощник' },
];

export default function ShiftChecklist() {
  const showToast = useToast();
  const today = new Date().toISOString().split('T')[0];
  const [role, setRole] = useState('manager');
  const [date, setDate] = useState(today);
  const [defs, setDefs] = useState(null);
  const [report, setReport] = useState(null);
  const [defsErr, setDefsErr] = useState(false);
  const [reportErr, setReportErr] = useState(false);

  const loadDefs = useCallback(async () => {
    setDefs(null); setDefsErr(false);
    try {
      api.clearCache('/api/hr/shift-tasks');
      const tasks = await api.get(`/api/hr/shift-tasks/catalog?role=${role}`);
      setDefs(tasks || []);
    } catch { setDefsErr(true); }
  }, [role]);

  const loadReport = useCallback(async () => {
    setReport(null); setReportErr(false);
    try {
      const data = await api.get(`/api/hr/shift-tasks/report?role=${role}&date=${date}`);
      setReport(data?.items || []);
    } catch { setReportErr(true); }
  }, [role, date]);

  useEffect(() => { loadDefs(); loadReport(); }, [loadDefs, loadReport]);

  const addTask = async () => {
    const title = prompt('Название задачи');
    if (!title) return;
    const required = confirm('Сделать обязательной?');
    try { await api.post('/api/hr/shift-tasks', { role, title, is_required: required }); showToast('Задача добавлена', 'success'); loadDefs(); } catch {}
  };

  const editTask = async (id) => {
    const title = prompt('Новое название');
    if (title === null) return;
    const required = confirm('Сделать обязательной?');
    try { await api.patch(`/api/hr/shift-tasks/${id}`, { title, is_required: required }); showToast('Задача обновлена', 'success'); loadDefs(); } catch {}
  };

  const deleteTask = async (id) => {
    if (!confirm('Удалить задачу?')) return;
    try { await api.delete(`/api/hr/shift-tasks/${id}`); showToast('Задача удалена', 'success'); loadDefs(); } catch {}
  };

  return (
    <>
      <div className="page-header"><h1 className="page-title">Чек-лист смены</h1><div></div></div>
      <div className="px-4 space-y-4 pb-8">
        <div className="card">
          <div className="reports-filter-grid mb-3">
            <div>
              <label className="input-label">Роль</label>
              <select className="input" value={role} onChange={e => setRole(e.target.value)}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Дата</label>
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={() => { loadDefs(); loadReport(); }}>Показать</button>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-700">Настройка чек-листа</h3>
            <button className="btn btn-secondary btn-sm" onClick={addTask}>+ Задача</button>
          </div>
          <div>
            {defsErr ? <div className="text-red-500 text-sm">Ошибка загрузки</div>
              : defs === null ? <div className="flex justify-center py-4"><div className="spinner"></div></div>
              : defs.length === 0 ? <div className="text-gray-400 text-sm">Нет задач для роли</div>
              : defs.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                  <div>
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-gray-400">{t.is_required ? 'Обязательная' : 'Необязательная'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost btn-sm" onClick={() => editTask(t.id)}>Редактировать</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteTask(t.id)}>Удалить</button>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="card">
          <h3 className="font-bold text-gray-700 mb-3">Выполнение за дату</h3>
          <div>
            {reportErr ? <div className="text-red-500 text-sm">Ошибка загрузки</div>
              : report === null ? <div className="flex justify-center py-4"><div className="spinner"></div></div>
              : report.length === 0 ? <div className="text-gray-400 text-sm">Нет сотрудников</div>
              : report.map(row => (
                <div key={row.user_id || row.full_name} className="card mb-3">
                  <div className="font-bold mb-2">{row.full_name}</div>
                  <div className="text-xs text-gray-400 mb-2">
                    Выполнено: {row.tasks.filter(t => t.completed).length}/{row.tasks.length}
                  </div>
                  <div className="space-y-2">
                    {row.tasks.map((t, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span>{t.title}</span>
                        <span className={t.completed ? 'text-green-600' : 'text-red-500'}>{t.completed ? 'Выполнено' : 'Не выполнено'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}
