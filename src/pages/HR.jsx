import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useModal } from '../components/Modal.jsx';
import { formatTime, formatDateTime, roleLabel } from '../lib/utils.js';

const TYPE_LABELS = { defect: '🔴 Брак', late: '🟡 Опоздание', complaint: '🟠 Жалоба', other: '⚪ Прочее' };

export default function HR() {
  const { user, lang } = useAuth();
  const showToast = useToast();
  const { showForm } = useModal();
  const isManager = ['director', 'manager'].includes(user.role);

  const [attendance, setAttendance] = useState(undefined); // undefined=loading, null=none, object=present
  const [shiftTasks, setShiftTasks] = useState(null);
  const [today, setToday] = useState(null);
  const [incidents, setIncidents] = useState(null);

  const loadShift = useCallback(async () => {
    try {
      api.clearCache('/api/hr/my-attendance');
      const a = await api.get('/api/hr/my-attendance');
      setAttendance(a || null);
    } catch { setAttendance(null); }
  }, []);
  const loadShiftTasks = useCallback(async () => {
    try {
      api.clearCache('/api/hr/shift-tasks');
      const tasks = await api.get('/api/hr/shift-tasks');
      setShiftTasks(tasks || []);
    } catch { setShiftTasks([]); }
  }, []);
  const loadToday = useCallback(async () => {
    try {
      api.clearCache('/api/hr/attendance/today');
      const list = await api.get('/api/hr/attendance/today');
      setToday(list || []);
    } catch { setToday([]); }
  }, []);
  const loadIncidents = useCallback(async () => {
    try {
      api.clearCache('/api/hr/incidents');
      const list = await api.get('/api/hr/incidents?status=pending');
      setIncidents(list || []);
    } catch { setIncidents([]); }
  }, []);

  useEffect(() => {
    loadShift();
    if (isManager) { loadToday(); loadIncidents(); }
  }, [isManager, loadShift, loadToday, loadIncidents]);

  useEffect(() => {
    if (attendance && !attendance.check_out) loadShiftTasks();
  }, [attendance, loadShiftTasks]);

  const checkin = async () => {
    try { await api.post('/api/hr/checkin'); showToast('Смена начата!', 'success'); loadShift(); } catch {}
  };
  const checkout = async () => {
    try {
      const result = await api.post('/api/hr/checkout');
      const summary = result?.shift_tasks_summary;
      if (summary && summary.not_completed > 0) {
        showToast(`Смена завершена. Выполнено: ${summary.completed}/${summary.total}, не выполнено: ${summary.not_completed}`, 'warning');
      } else {
        showToast('Смена завершена!', 'success');
      }
      loadShift();
    } catch {}
  };
  const toggleShiftTask = async (id, completed) => {
    try { await api.post(`/api/hr/shift-tasks/${id}/complete`, { completed: !completed }); loadShiftTasks(); } catch {}
  };

  const showIncident = async () => {
    let users = [];
    try { users = await api.get('/api/users') || []; } catch {}
    const employees = users.filter(u => u.role !== 'director' && u.is_active);
    showForm({
      title: 'Новый инцидент',
      fields: [
        { name: 'user_id', label: 'Сотрудник', type: 'select',
          options: employees.map(u => ({ value: u.id, label: `${u.full_name} (${roleLabel(u.role, lang)})` })) },
        { name: 'type', label: 'Тип', type: 'select',
          options: [
            { value: 'defect', label: 'Брак' }, { value: 'late', label: 'Опоздание' },
            { value: 'complaint', label: 'Жалоба' }, { value: 'other', label: 'Прочее' },
          ]},
        { name: 'description', label: 'Описание', type: 'textarea', required: true, placeholder: 'Что произошло...' },
        { name: 'material_waste', label: 'Потеря материала (м²)', type: 'number', step: '0.1', placeholder: 'Только для брака' },
        { name: 'deduction_amount', label: 'Штраф (сумма)', type: 'number', step: '100', placeholder: '0' },
      ],
      submitText: 'Создать',
      onSubmit: async (data) => {
        try {
          await api.post('/api/hr/incidents', {
            user_id: parseInt(data.user_id),
            type: data.type,
            description: data.description,
            material_waste: data.material_waste ? parseFloat(data.material_waste) : null,
            deduction_amount: data.deduction_amount ? parseFloat(data.deduction_amount) : null,
          });
          showToast('Инцидент создан', 'success');
          loadIncidents();
        } catch {}
      },
    });
  };

  return (
    <>
      <div className="page-header"><h1 className="page-title">Кадры</h1><div></div></div>
      <div className="px-4 space-y-4 pb-8">
        <div className="card">
          <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Моя смена</h3>
          <div className="text-center py-4">
            {attendance === undefined ? <div className="spinner mx-auto"></div>
              : attendance === null ? (
                <>
                  <p className="text-gray-500 mb-4">Вы ещё не отметились</p>
                  <button className="btn btn-success btn-lg btn-block" style={{ minHeight: 80, fontSize: 20 }} onClick={checkin}>☀️ Начать смену</button>
                </>
              ) : !attendance.check_out ? (
                <>
                  <div className="text-green-600 font-bold text-lg mb-1">На смене</div>
                  <div className="text-gray-500 mb-4">Приход: {formatTime(attendance.check_in, lang)}</div>
                  <button className="btn btn-warning btn-lg btn-block" style={{ minHeight: 80, fontSize: 20 }} onClick={checkout}>🌙 Закончить смену</button>
                </>
              ) : (
                <>
                  <div className="text-gray-600 font-bold text-lg mb-1">Смена завершена</div>
                  <div className="text-gray-400">Приход: {formatTime(attendance.check_in, lang)} — Уход: {formatTime(attendance.check_out, lang)}</div>
                </>
              )}
          </div>
        </div>

        {attendance && !attendance.check_out && (
          <div className="card">
            <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Чек-лист перед уходом</h3>
            {shiftTasks === null ? <div className="spinner mx-auto"></div>
              : shiftTasks.length === 0 ? <p className="text-gray-400 text-sm">Нет задач для роли</p>
              : shiftTasks.map(t => (
                <div key={t.id} className="task-item" onClick={() => toggleShiftTask(t.id, t.completed)}>
                  <div className={`task-checkbox ${t.completed ? 'checked' : ''}`}></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }} className={t.completed ? 'task-done' : ''}>{t.title}</div>
                    {t.is_required && <div className="text-xs text-gray-400">Обязательная</div>}
                  </div>
                </div>
              ))}
          </div>
        )}

        {isManager && (
          <>
            <div className="card">
              <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Сегодня на работе</h3>
              {today === null ? <div className="spinner mx-auto"></div>
                : today.length === 0 ? <p className="text-gray-400 text-sm">Никто ещё не отметился</p>
                : today.map(a => (
                  <div key={a.id || a.user_id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <span className="font-medium">{a.full_name}</span>
                      <span className="text-xs text-gray-400 ml-2">{roleLabel(a.role, lang)}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-green-600">{formatTime(a.check_in, lang)}</span>
                      {a.check_out ? <><span className="text-gray-400"> — </span><span className="text-red-500">{formatTime(a.check_out, lang)}</span></>
                                   : <span className="badge bg-green-100 text-green-700 ml-2">на месте</span>}
                    </div>
                  </div>
                ))}
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-400 uppercase">Инциденты</h3>
                <button className="btn btn-danger btn-sm" onClick={showIncident}>+ Инцидент</button>
              </div>
              {incidents === null ? <div className="spinner mx-auto"></div>
                : incidents.length === 0 ? <p className="text-gray-400 text-sm">Нет открытых инцидентов</p>
                : incidents.map(i => (
                  <div key={i.id} className="py-3 border-b last:border-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-medium">{TYPE_LABELS[i.type] || i.type}</span>
                        <span className="text-gray-500 ml-2">— {i.employee_name}</span>
                      </div>
                      {i.status === 'pending'
                        ? <span className="badge bg-yellow-100 text-yellow-700">Ожидает</span>
                        : <span className="badge bg-green-100 text-green-700">Обсуждён</span>}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{i.description}</p>
                    {i.material_waste && <p className="text-sm text-red-500">Потеря материала: {i.material_waste} м²</p>}
                    {i.deduction_amount && <p className="text-sm text-red-600">Штраф: {i.deduction_amount}</p>}
                    <div className="text-xs text-gray-400 mt-1">{formatDateTime(i.created_at, lang)} • {i.created_by_name}</div>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
