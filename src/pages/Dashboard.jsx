import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatCurrency, formatDate } from '../lib/utils.js';
import { useRealtime } from '../lib/useRealtime.js';

const PERIODS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'custom', label: 'Период' },
];

function getDates(period) {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  if (period === 'today') return { from: to, to };
  if (period === 'week') {
    const d = new Date(now); d.setDate(now.getDate() - 7);
    return { from: d.toISOString().split('T')[0], to };
  }
  const d = new Date(now); d.setDate(now.getDate() - 30);
  return { from: d.toISOString().split('T')[0], to };
}

export default function Dashboard() {
  const { user, lang, token } = useAuth();
  const showToast = useToast();
  const [period, setPeriod] = useState('month');
  const [customRange, setCustomRange] = useState(getDates('month'));
  const [summary, setSummary] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const isDirector = user?.role === 'director';
  const isManager = ['director', 'manager'].includes(user?.role);
  const canUsePeriods = isManager;

  const activeRange = period === 'custom' ? customRange : getDates(period);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const { from, to } = activeRange;
      const requests = [];
      if (isDirector) requests.push(api.get(`/api/reports/finance?date_from=${from}&date_to=${to}`));
      else if (isManager) requests.push(api.get(`/api/reports/orders-summary?date_from=${from}&date_to=${to}`));
      else requests.push(Promise.resolve(null));
      requests.push(api.get('/api/tasks?done=0'));
      const [s, t] = await Promise.all(requests);
      setSummary(s); setTasks(t || []);
    } catch { setError(true); } finally { setLoading(false); }
  }, [activeRange.from, activeRange.to, isDirector, isManager]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period]);
  // Любое существенное событие на бэке — переподтягиваем сводку.
  useRealtime(['orders:changed', 'hr:incident', 'tasks:changed', 'payroll:paid'], load);

  const applyCustom = () => load();

  const toggleTask = async (id) => {
    try {
      await api.patch(`/api/tasks/${id}/done`);
      load();
    } catch {}
  };

  const exportCsv = async () => {
    const { from, to } = activeRange;
    if (!from || !to) { showToast('Укажите диапазон дат', 'warning'); return; }
    try {
      const q = new URLSearchParams({ date_from: from, date_to: to }).toString();
      const res = await fetch(`/api/reports/finance-export.csv?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { showToast('Ошибка экспорта', 'error'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `finance_${from}_${to}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      showToast('Отчет скачан', 'success');
    } catch { showToast('Ошибка экспорта', 'error'); }
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title"><span className="text-gradient">Тамга Сервис</span></h1>
        <div></div>
      </div>
      <div className="px-4 space-y-4 pb-8 slide-up">
        {canUsePeriods && (
          <>
            <div className="period-selector">
              {PERIODS.map(p => (
                <button key={p.id} className={`period-btn ${p.id === period ? 'active' : ''}`}
                        onClick={() => setPeriod(p.id)}>{p.label}</button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="card custom-range-card">
                <div className="custom-range-grid">
                  <div className="flex-1">
                    <label className="input-label">С</label>
                    <input type="date" className="input" value={customRange.from}
                      onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))} />
                  </div>
                  <div className="flex-1">
                    <label className="input-label">По</label>
                    <input type="date" className="input" value={customRange.to}
                      onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))} />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={applyCustom}>OK</button>
                </div>
              </div>
            )}
          </>
        )}
        {isDirector && (
          <div className="flex justify-end">
            <button className="btn btn-secondary btn-sm" onClick={exportCsv}>Экспорт CSV</button>
          </div>
        )}
        <div>
          {loading ? (
            <div className="flex justify-center py-8"><div className="spinner"></div></div>
          ) : error ? (
            <div style={{ textAlign: 'center', color: 'var(--danger)', padding: 32 }}>Ошибка загрузки</div>
          ) : (
            <>
              {isDirector && summary && <DirectorView fin={summary} lang={lang} />}
              {!isDirector && isManager && summary && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="stat-card stat-card-blue">
                    <div className="stat-label">Заказов</div>
                    <div className="stat-value number-animate">{summary.totals.total_orders}</div>
                  </div>
                  <div className="stat-card stat-card-green">
                    <div className="stat-label">Выручка</div>
                    <div className="stat-value number-animate" style={{ color: 'var(--success)' }}>
                      {formatCurrency(summary.totals.total_revenue, lang)}
                    </div>
                  </div>
                </div>
              )}
              <TasksCard tasks={tasks} onToggle={toggleTask} lang={lang} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function DirectorView({ fin, lang }) {
  const expenses = (fin.material_cost || 0) + (fin.payroll || 0) + (fin.penalties || 0);
  const profit = fin.profit || 0;
  const margin = fin.revenue > 0 ? Math.round((profit / fin.revenue) * 100) : 0;
  const progress = Math.max(0, Math.min(100, margin));
  const donutBg = `conic-gradient(var(--success) ${progress}%, var(--bg-tertiary) ${progress}% 100%)`;
  const daily = Array.isArray(fin.daily) ? [...fin.daily].reverse() : [];

  return (
    <div className="director-dashboard">
      <div className="card finance-hero mb-4">
        <div>
          <div className="stat-label">Финансы за период</div>
          <div className="finance-main">{formatCurrency(fin.revenue, lang)}</div>
          <div className="finance-sub">Доход • {fin.orders_count} заказов</div>
        </div>
        <div className="margin-gauge-wrap">
          <div className="margin-gauge" style={{ background: donutBg }}>
            <div className="margin-gauge-inner">{margin}%</div>
          </div>
          <div className="finance-sub">Маржа</div>
        </div>
      </div>
      <div className="director-kpi-grid mb-4">
        <Kpi label="Доход" value={fin.revenue} color="var(--success)" lang={lang} />
        <Kpi label="Расходы" value={expenses} color="var(--danger)" lang={lang} />
        <Kpi label="Прибыль" value={profit} color={profit >= 0 ? 'var(--accent)' : 'var(--danger)'} lang={lang} />
        <Kpi label="Штрафы" value={fin.penalties || 0} color="var(--warning)" lang={lang} />
      </div>
      <div className="card mb-4">
        <div className="dash-title">Тренд: доход и расходы</div>
        <FinanceLines daily={daily} lang={lang} />
      </div>
      <div className="card mb-4">
        <div className="dash-title">Структура расходов</div>
        <ExpenseStructure material={fin.material_cost || 0} payroll={fin.payroll || 0} penalties={fin.penalties || 0} lang={lang} />
      </div>
      <TopServices items={fin.top_services || []} lang={lang} />
    </div>
  );
}

function Kpi({ label, value, color, lang }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>{formatCurrency(value, lang)}</div>
    </div>
  );
}

function FinanceLines({ daily, lang }) {
  if (!daily.length) return <div className="text-sm text-gray-400">Недостаточно данных для графика</div>;
  const width = 640, height = 180, pad = 16;
  const rev = daily.map(d => Number(d.revenue || 0));
  const cost = daily.map(d => Number(d.cost || 0));
  const maxVal = Math.max(1, ...rev, ...cost);
  const toPoints = (vals) => vals.map((v, i) => {
    const x = pad + (i * (width - pad * 2)) / Math.max(1, vals.length - 1);
    const y = height - pad - (v / maxVal) * (height - pad * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  return (
    <div className="line-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="line-chart" preserveAspectRatio="none">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="chart-axis" />
        <polyline points={toPoints(cost)} className="chart-line-cost" />
        <polyline points={toPoints(rev)} className="chart-line-rev" />
      </svg>
      <div className="line-chart-legend">
        <span><i className="legend-dot legend-dot-rev"></i> Доход</span>
        <span><i className="legend-dot legend-dot-cost"></i> Расход</span>
        <span className="line-chart-dates">{formatDate(daily[0].day, lang)} — {formatDate(daily[daily.length - 1].day, lang)}</span>
      </div>
    </div>
  );
}

function ExpenseStructure({ material, payroll, penalties, lang }) {
  const total = Math.max(1, material + payroll + penalties);
  const mPct = Math.round((material / total) * 100);
  const pPct = Math.round((payroll / total) * 100);
  const penPct = Math.max(0, 100 - mPct - pPct);
  const gradient = `conic-gradient(var(--danger) 0% ${mPct}%, var(--warning) ${mPct}% ${mPct + pPct}%, var(--purple) ${mPct + pPct}% 100%)`;
  return (
    <div className="expense-structure">
      <div className="expense-donut" style={{ background: gradient }}>
        <div className="expense-donut-inner">{formatCurrency(material + payroll + penalties, lang)}</div>
      </div>
      <div className="expense-legend">
        <LegendRow label="Материалы" value={material} color="var(--danger)" pct={mPct} lang={lang} />
        <LegendRow label="Зарплаты" value={payroll} color="var(--warning)" pct={pPct} lang={lang} />
        <LegendRow label="Штрафы" value={penalties} color="var(--purple)" pct={penPct} lang={lang} />
      </div>
    </div>
  );
}

function LegendRow({ label, value, color, pct, lang }) {
  return (
    <div className="legend-row">
      <span className="legend-name"><i className="legend-dot" style={{ background: color }}></i>{label}</span>
      <span className="legend-value">{formatCurrency(value, lang)} ({pct}%)</span>
    </div>
  );
}

function TopServices({ items, lang }) {
  if (!items.length) return null;
  const maxRev = Math.max(...items.map(s => Number(s.revenue || 0)), 1);
  return (
    <div className="card mb-4">
      <div className="dash-title">Топ услуг</div>
      <div className="top-services-list">
        {items.map((s, idx) => {
          const pct = Math.max(6, Math.round((Number(s.revenue || 0) / maxRev) * 100));
          return (
            <div key={idx} className="top-service-row">
              <div className="top-service-head">
                <span className="top-service-index">{idx + 1}</span>
                <span className="top-service-name">{s.name_ru}</span>
                <span className="top-service-value">{formatCurrency(s.revenue, lang)}</span>
              </div>
              <div className="top-service-bar">
                <div className="top-service-fill" style={{ width: `${pct}%` }}></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TasksCard({ tasks, onToggle, lang }) {
  if (!tasks.length) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
        <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Нет активных задач</div>
      </div>
    );
  }
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Мои задачи</h3>
        <span className="badge" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.slice(0, 5).map(t => (
          <div key={t.id} className="task-item">
            <div className={`task-checkbox ${t.is_done ? 'checked' : ''}`}
                 onClick={(e) => { e.stopPropagation(); onToggle(t.id); }}></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, ...(t.is_done ? { textDecoration: 'line-through', color: 'var(--text-tertiary)' } : {}) }}>{t.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {t.type === 'daily' ? 'На сегодня' : 'На неделю'} {t.due_date ? '• до ' + formatDate(t.due_date, lang) : ''}
              </div>
            </div>
          </div>
        ))}
        {tasks.length > 5 && (
          <Link to="/tasks" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
            Показать все ({tasks.length})...
          </Link>
        )}
      </div>
    </div>
  );
}
