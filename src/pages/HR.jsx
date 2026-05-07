import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useModal } from '../components/Modal.jsx';
import { formatCurrency, formatTime, formatDateTime, roleLabel } from '../lib/utils.js';
import { useRealtime } from '../lib/useRealtime.js';

const TYPE_LABELS = {
  defect: 'Брак',
  late: 'Опоздание',
  complaint: 'Жалоба',
  other: 'Прочее',
};

const TYPE_CLASS = {
  defect: 'hr-incident-type-defect',
  late: 'hr-incident-type-late',
  complaint: 'hr-incident-type-complaint',
  other: 'hr-incident-type-other',
};

const SVG = {
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.5v5l3.5 3.5" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8.5" r="3.3" />
      <path d="M3.5 19.5a5.8 5.8 0 0 1 11 0" />
      <circle cx="17.5" cy="7.5" r="2.5" />
      <path d="M16 13.5a5 5 0 0 1 4.5 3" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.8 18.8 6v5.5c0 4.2-2.8 7.9-6.8 8.9-4-1-6.8-4.7-6.8-8.9V6L12 3.8Z" />
      <path d="M12 8.1v4.7" />
      <circle cx="12" cy="16.1" r="0.65" fill="currentColor" stroke="none" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.8 4.5 4.4L19 7.8" />
    </svg>
  ),
};

function fmtElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function parseTs(value) {
  if (!value) return null;
  let raw = String(value).trim().replace(' ', 'T');
  raw = raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  raw = raw.replace(/([+-]\d{2})$/, '$1:00');
  if (!/[Zz]$|[+-]\d{2}:\d{2}$/.test(raw)) raw += 'Z';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateInput() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function HR() {
  const { user, lang } = useAuth();
  const showToast = useToast();
  const { showConfirm, showForm } = useModal();
  const isManager = ['director', 'manager'].includes(user.role);

  const [attendance, setAttendance] = useState(undefined);
  const [shiftTasks, setShiftTasks] = useState(null);
  const [today, setToday] = useState(null);
  const [incidents, setIncidents] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [now, setNow] = useState(Date.now());

  const loadShift = useCallback(async () => {
    try {
      api.clearCache('/api/hr/my-attendance');
      const a = await api.get('/api/hr/my-attendance');
      setAttendance(a || null);
    } catch {
      setAttendance(null);
    }
  }, []);

  const loadShiftTasks = useCallback(async () => {
    try {
      api.clearCache('/api/hr/shift-tasks');
      const tasks = await api.get('/api/hr/shift-tasks');
      setShiftTasks(tasks || []);
    } catch {
      setShiftTasks([]);
    }
  }, []);

  const loadToday = useCallback(async () => {
    try {
      api.clearCache('/api/hr/attendance/today');
      const list = await api.get('/api/hr/attendance/today');
      setToday(list || []);
    } catch {
      setToday([]);
    }
  }, []);

  const loadIncidents = useCallback(async () => {
    try {
      api.clearCache('/api/hr/incidents');
      const list = await api.get('/api/hr/incidents?status=pending');
      setIncidents(list || []);
    } catch {
      setIncidents([]);
    }
  }, []);

  const loadExpenses = useCallback(async () => {
    try {
      const date = localDateInput();
      api.clearCache('/api/hr/expenses');
      const list = await api.get(`/api/hr/expenses?date_from=${date}&date_to=${date}`);
      setExpenses(list || []);
    } catch {
      setExpenses([]);
    }
  }, []);

  useEffect(() => {
    loadShift();
    if (isManager) {
      loadToday();
      loadIncidents();
      loadExpenses();
    }
  }, [isManager, loadShift, loadToday, loadIncidents, loadExpenses]);

  useEffect(() => {
    if (attendance && !attendance.check_out) loadShiftTasks();
  }, [attendance, loadShiftTasks]);

  useEffect(() => {
    if (!attendance || attendance.check_out) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [attendance]);

  useRealtime('hr:attendance', useCallback(() => {
    loadShift();
    if (isManager) loadToday();
  }, [loadShift, loadToday, isManager]));

  useRealtime('hr:incident', useCallback(() => {
    if (isManager) loadIncidents();
  }, [loadIncidents, isManager]));

  useRealtime('hr:expense', useCallback(() => {
    if (isManager) loadExpenses();
  }, [loadExpenses, isManager]));

  const checkin = async () => {
    try {
      await api.post('/api/hr/checkin');
      showToast('Смена начата!', 'success');
      loadShift();
    } catch {}
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
    try {
      await api.post(`/api/hr/shift-tasks/${id}/complete`, { completed: !completed });
      loadShiftTasks();
    } catch {}
  };

  const showIncident = async () => {
    let users = [];
    try { users = await api.get('/api/users') || []; } catch {}
    const employees = users.filter(u => u.role !== 'director' && u.is_active);
    showForm({
      title: 'Новый инцидент',
      fields: [
        { name: 'user_id', label: 'Сотрудник', type: 'select', options: employees.map(u => ({ value: u.id, label: `${u.full_name} (${roleLabel(u.role, lang)})` })) },
        { name: 'type', label: 'Тип', type: 'select', options: [
          { value: 'defect', label: 'Брак' },
          { value: 'late', label: 'Опоздание' },
          { value: 'complaint', label: 'Жалоба' },
          { value: 'other', label: 'Прочее' },
        ] },
        { name: 'description', label: 'Описание', type: 'textarea', required: true, placeholder: 'Что произошло...' },
        { name: 'material_waste', label: 'Потеря материала (м²)', type: 'number', step: '0.1', placeholder: 'Только для брака' },
        { name: 'deduction_amount', label: 'Штраф (сумма)', type: 'number', step: '100', placeholder: '0' },
      ],
      submitText: 'Создать',
      onSubmit: async (data) => {
        try {
          await api.post('/api/hr/incidents', {
            user_id: parseInt(data.user_id, 10),
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

  const showExpense = () => {
    showForm({
      title: 'Новый расход',
      fields: [
        { name: 'expense_date', label: 'Дата', type: 'date', value: localDateInput(), required: true },
        { name: 'amount', label: 'Сумма', type: 'number', step: '1', required: true, placeholder: '0' },
        { name: 'note', label: 'Комментарий', type: 'textarea', required: true, placeholder: 'Например: доставка, бензин, обед' },
      ],
      submitText: 'Добавить расход',
      onSubmit: async (data) => {
        try {
          await api.post('/api/hr/expenses', {
            expense_date: data.expense_date || localDateInput(),
            amount: parseFloat(data.amount),
            note: data.note,
          });
          showToast('Расход добавлен', 'success');
          loadExpenses();
        } catch {}
      },
    });
  };

  const deleteExpense = (expense) => {
    showConfirm({
      title: 'Удалить расход',
      body: `Удалить расход "${expense.note}" на ${formatCurrency(expense.amount, lang)}?`,
      confirmText: 'Удалить',
      danger: true,
      onConfirm: async () => {
        try {
          await api.delete(`/api/hr/expenses/${expense.id}`);
          showToast('Расход удалён', 'warning');
          loadExpenses();
        } catch {}
      },
    });
  };

  const isShiftActive = Boolean(attendance && !attendance.check_out);
  const isShiftClosed = Boolean(attendance && attendance.check_out);
  const shiftStartedAt = isShiftActive ? parseTs(attendance?.check_in) : null;
  const shiftElapsed = shiftStartedAt ? fmtElapsed(now - shiftStartedAt.getTime()) : '00:00:00';

  return (
    <main className="hr-page slide-up">
      <header className="hr-page-header">
        <h1 className="hr-page-title">Кадры</h1>
      </header>

      <div className="hr-page-body">
        <section className="hr-section hr-shift-section">
          <h2 className="hr-section-title">Моя смена</h2>

          {attendance === undefined && (
            <div className="hr-shift-state hr-loading-state">
              <div className="spinner"></div>
            </div>
          )}

          {attendance === null && (
            <div className="hr-shift-state hr-shift-empty-state">
              <p className="hr-shift-note">Вы ещё не отметились</p>
              <button className="hr-shift-primary-btn" onClick={checkin}>
                <span className="hr-shift-btn-icon">{SVG.clock}</span>
                Начать смену
              </button>
            </div>
          )}

          {isShiftActive && (
            <div className="hr-shift-state hr-shift-active-state">
              <div className="hr-shift-status-badge hr-shift-status-live">На смене</div>
              <div className="hr-shift-timer">{shiftElapsed}</div>
              <div className="hr-shift-active-time">Приход: {formatTime(attendance.check_in, lang)}</div>
              <button className="hr-shift-secondary-btn" onClick={checkout}>
                <span className="hr-shift-btn-icon">{SVG.check}</span>
                Закончить смену
              </button>
            </div>
          )}

          {isShiftClosed && (
            <div className="hr-shift-state hr-shift-done-state">
              <div className="hr-shift-status-badge hr-shift-status-done">Смена завершена</div>
              <div className="hr-shift-done-range">
                Приход: {formatTime(attendance.check_in, lang)} — Уход: {formatTime(attendance.check_out, lang)}
              </div>
            </div>
          )}
        </section>

        {isShiftActive && (
          <section className="hr-section hr-checklist-section">
            <h2 className="hr-section-title">Чек-лист перед уходом</h2>
            {shiftTasks === null ? (
              <div className="hr-loading-state"><div className="spinner"></div></div>
            ) : shiftTasks.length === 0 ? (
              <div className="hr-empty-row hr-empty-row-compact">
                <div className="hr-empty-text">Нет задач для роли</div>
              </div>
            ) : (
              <div className="hr-checklist-list">
                {shiftTasks.map(t => (
                  <button key={t.id} className="hr-checklist-item" onClick={() => toggleShiftTask(t.id, t.completed)}>
                    <span className={`task-checkbox ${t.completed ? 'checked' : ''}`}></span>
                    <span className="hr-checklist-item-main">
                      <span className={`hr-checklist-item-title ${t.completed ? 'task-done' : ''}`}>{t.title}</span>
                      {t.is_required && <span className="hr-checklist-required">Обязательная</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {isManager && (
          <section className="hr-section hr-attendance-section">
            <h2 className="hr-section-title">Сегодня на работе</h2>
            {today === null ? (
              <div className="hr-loading-state"><div className="spinner"></div></div>
            ) : today.length === 0 ? (
              <div className="hr-empty-row">
                <div className="hr-empty-icon">{SVG.users}</div>
                <div className="hr-empty-text">Никто ещё не отметился</div>
              </div>
            ) : (
              <div className="hr-people-list">
                {today.map(a => (
                  <div key={a.id || a.user_id} className="hr-person-row">
                    <div className="hr-person-main">
                      <div className="hr-person-name">{a.full_name}</div>
                      <div className="hr-person-role">{roleLabel(a.role, lang)}</div>
                    </div>
                    <div className="hr-person-meta">
                      <span className="hr-person-checkin">{formatTime(a.check_in, lang)}</span>
                      {a.check_out ? (
                        <>
                          <span className="hr-person-separator">—</span>
                          <span className="hr-person-checkout">{formatTime(a.check_out, lang)}</span>
                        </>
                      ) : (
                        <span className="hr-person-badge">на месте</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {isManager && (
          <section className="hr-section hr-expenses-section">
            <div className="hr-section-head">
              <h2 className="hr-section-title">Ежедневные расходы</h2>
              <button className="hr-outline-btn" onClick={showExpense}>+ Расход</button>
            </div>

            {expenses === null ? (
              <div className="hr-loading-state"><div className="spinner"></div></div>
            ) : expenses.length === 0 ? (
              <div className="hr-empty-row">
                <div className="hr-empty-icon">{SVG.shield}</div>
                <div className="hr-empty-text">Сегодня расходов нет</div>
              </div>
            ) : (
              <div className="hr-expenses-list">
                {expenses.map(expense => (
                  <article key={expense.id} className="hr-expense-card">
                    <div className="hr-expense-main">
                      <strong>{formatCurrency(expense.amount, lang)}</strong>
                      <p>{expense.note}</p>
                      <span>{expense.expense_date} • {expense.created_by_name}</span>
                    </div>
                    <button type="button" className="hr-expense-delete" onClick={() => deleteExpense(expense)}>
                      Удалить
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {isManager && (
          <section className="hr-section hr-incidents-section">
            <div className="hr-section-head">
              <h2 className="hr-section-title">Инциденты</h2>
              <button className="hr-outline-btn" onClick={showIncident}>+ Инцидент</button>
            </div>

            {incidents === null ? (
              <div className="hr-loading-state"><div className="spinner"></div></div>
            ) : incidents.length === 0 ? (
              <div className="hr-empty-row">
                <div className="hr-empty-icon">{SVG.shield}</div>
                <div className="hr-empty-text">Нет открытых инцидентов</div>
              </div>
            ) : (
              <div className="hr-incidents-list">
                {incidents.map(i => (
                  <article key={i.id} className="hr-incident-card">
                    <div className="hr-incident-head">
                      <div className="hr-incident-title-wrap">
                        <span className={`hr-incident-type ${TYPE_CLASS[i.type] || TYPE_CLASS.other}`}>{TYPE_LABELS[i.type] || i.type}</span>
                        <span className="hr-incident-employee">{i.employee_name}</span>
                      </div>
                      <span className={`hr-incident-status ${i.status === 'pending' ? 'pending' : 'done'}`}>
                        {i.status === 'pending' ? 'Ожидает' : 'Обсуждён'}
                      </span>
                    </div>
                    <p className="hr-incident-description">{i.description}</p>
                    <div className="hr-incident-details">
                      {i.material_waste ? <span>Потеря материала: {i.material_waste} м²</span> : null}
                      {i.deduction_amount ? <span>Штраф: {i.deduction_amount}</span> : null}
                    </div>
                    <div className="hr-incident-footer">{formatDateTime(i.created_at, lang)} • {i.created_by_name}</div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
