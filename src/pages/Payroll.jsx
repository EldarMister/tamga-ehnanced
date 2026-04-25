import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useModal } from '../components/Modal.jsx';
import { formatCurrency, roleLabel } from '../lib/utils.js';

function getMonthDates(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return {
    start: first.toISOString().split('T')[0],
    end: last.toISOString().split('T')[0],
    label: first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
  };
}

export default function Payroll() {
  const { lang } = useAuth();
  const showToast = useToast();
  const { showConfirm } = useModal();
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState(null);
  const [edits, setEdits] = useState({});
  const [error, setError] = useState(false);

  const month = getMonthDates(offset);

  const load = useCallback(async () => {
    setReport(null); setError(false); setEdits({});
    try {
      api.clearCache('/api/payroll');
      const data = await api.get(`/api/payroll/month-report?month_start=${month.start}&month_end=${month.end}`);
      setReport(data || []);
    } catch { setError(true); }
  }, [month.start, month.end]);

  useEffect(() => { load(); }, [load]);

  const getValues = (r) => {
    const empId = r.employee.id;
    const e = edits[empId] || {};
    const p = r.payroll;
    const suggested = Number.isFinite(p?.deductions) ? p.deductions : (r.penalties_total || 0);
    return {
      base: e.base != null ? Number(e.base) : (p?.base_salary || 0),
      bonus: e.bonus != null ? Number(e.bonus) : (p?.bonus || 0),
      ded: e.ded != null ? Number(e.ded) : suggested,
    };
  };

  const updateEdit = (empId, field, value) => setEdits(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [field]: value } }));

  const save = async (r) => {
    const v = getValues(r);
    try {
      await api.post('/api/payroll', {
        user_id: r.employee.id,
        month_start: month.start, month_end: month.end,
        base_salary: v.base, bonus: v.bonus, deductions: v.ded,
      });
      showToast('Сохранено', 'success'); load();
    } catch {}
  };

  const markPaid = (r) => {
    if (!r.payroll?.id) { showToast('Сначала сохраните данные', 'warning'); return; }
    showConfirm({
      title: 'Подтверждение выплаты', body: 'Отметить как выплаченное?', confirmText: 'Выплатить',
      onConfirm: async () => {
        try { await api.patch(`/api/payroll/${r.payroll.id}/pay`); showToast('Выплата отмечена', 'success'); load(); } catch {}
      },
    });
  };

  return (
    <>
      <div className="page-header"><h1 className="page-title">Зарплата</h1><div></div></div>
      <div className="px-4 space-y-4 pb-8">
        <div className="card">
          <div className="flex items-center justify-between gap-2">
            <button className="btn btn-sm btn-secondary" onClick={() => setOffset(o => o - 1)}>← Пред.</button>
            <div className="text-center" style={{ minWidth: 0 }}>
              <div className="font-bold" style={{ textTransform: 'capitalize' }}>{month.label}</div>
              <div className="text-xs text-gray-400">{month.start} — {month.end}</div>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() => setOffset(o => o + 1)}>След. →</button>
          </div>
        </div>
        <div>
          {error ? <div className="text-center text-red-500 py-8">Ошибка загрузки</div>
            : report === null ? <div className="flex justify-center py-8"><div className="spinner"></div></div>
            : report.length === 0 ? <div className="text-center text-gray-400 py-8">Нет сотрудников</div>
            : report.map(r => {
              const v = getValues(r);
              const total = v.base + v.bonus - v.ded;
              const empId = r.employee.id;
              const p = r.payroll;
              return (
                <div key={empId} className="card mb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold text-lg">{r.employee.full_name}</div>
                      <span className="text-xs text-gray-400">{roleLabel(r.employee.role, lang)}</span>
                    </div>
                    {p?.is_paid && <span className="badge bg-green-100 text-green-700">Выплачено</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm mb-4">
                    <div className="bg-gray-50 rounded-lg p-2"><div className="text-gray-400">Дней</div><div className="font-bold text-lg">{r.days_worked}</div></div>
                    <div className="bg-gray-50 rounded-lg p-2"><div className="text-gray-400">Задач</div><div className="font-bold text-lg">{r.tasks_done}</div></div>
                    <div className="bg-gray-50 rounded-lg p-2"><div className="text-gray-400">Инцид.</div><div className={`font-bold text-lg ${r.incidents.length > 0 ? 'text-red-600' : ''}`}>{r.incidents.length}</div></div>
                  </div>
                  {r.incidents.length > 0 && (
                    <div className="bg-red-50 rounded-lg p-3 mb-4 text-sm">
                      {r.incidents.map((i, k) => (
                        <div key={k} className="mb-1">
                          <span className="font-medium">{i.type === 'defect' ? '🔴 Брак' : i.type === 'late' ? '🟡 Опозд.' : '🟠 ' + i.type}</span>
                          <span className="text-gray-600"> {i.description}</span>
                          {i.deduction_amount && <span className="text-red-700"> • штраф {i.deduction_amount}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="input-label">Оклад</label>
                        <input type="number" className="input text-center" step="100"
                               value={v.base} onChange={e => updateEdit(empId, 'base', e.target.value)} />
                      </div>
                      <div>
                        <label className="input-label">Бонус</label>
                        <input type="number" className="input text-center" step="100"
                               value={v.bonus} onChange={e => updateEdit(empId, 'bonus', e.target.value)} />
                      </div>
                      <div>
                        <label className="input-label">Штраф</label>
                        <input type="number" className="input text-center" step="100"
                               value={v.ded} onChange={e => updateEdit(empId, 'ded', e.target.value)} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-blue-50 rounded-lg p-3">
                      <span className="font-bold">Итого:</span>
                      <span className="font-bold text-xl text-blue-800">{formatCurrency(total, lang)}</span>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-primary flex-1" onClick={() => save(r)}>Сохранить</button>
                      {!p?.is_paid && <button className="btn btn-success flex-1" onClick={() => markPaid(r)}>Выплатить</button>}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}
