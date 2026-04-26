import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatCurrency, formatDate, statusBadgeClass, statusLabel, roleLabel } from '../lib/utils.js';
import { useRealtime } from '../lib/useRealtime.js';

const PERIODS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'custom', label: 'Период' },
];

const KPI_ICONS = {
  revenue: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m4 15 5-5 4 4 7-7" /><path d="M16 7h4v4" /></svg>,
  expenses: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m4 8 5 5 4-4 7 7" /><path d="M16 16h4v-4" /></svg>,
  profit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18h16" /><path d="M7 15v-4" /><path d="M12 15V7" /><path d="M17 15V5" /><path d="m14 8 3-3 3 3" /></svg>,
  fines: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h5" /><path d="M10 14h4a2 2 0 0 0 0-4h-3v8" /><path d="M10 14h6" /></svg>,
};

const EMPTY_DAILY = [
  { day: '2026-05-01', revenue: 32000, cost: 12000 },
  { day: '2026-05-03', revenue: 40000, cost: 21000 },
  { day: '2026-05-05', revenue: 27000, cost: 8000 },
  { day: '2026-05-07', revenue: 34000, cost: 10000 },
  { day: '2026-05-09', revenue: 60000, cost: 35000 },
  { day: '2026-05-11', revenue: 44000, cost: 16000 },
  { day: '2026-05-13', revenue: 36000, cost: 13000 },
  { day: '2026-05-15', revenue: 68000, cost: 30000 },
  { day: '2026-05-17', revenue: 85000, cost: 41000 },
  { day: '2026-05-19', revenue: 70000, cost: 39000 },
  { day: '2026-05-20', revenue: 78000, cost: 47000 },
  { day: '2026-05-22', revenue: 54000, cost: 29000 },
  { day: '2026-05-24', revenue: 81000, cost: 41000 },
  { day: '2026-05-27', revenue: 91000, cost: 60000 },
  { day: '2026-05-31', revenue: 72000, cost: 41000 },
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
  const [ordersBreakdown, setOrdersBreakdown] = useState(null);
  const [materialUsage, setMaterialUsage] = useState([]);
  const [employeeStats, setEmployeeStats] = useState([]);
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
      const q = `?date_from=${from}&date_to=${to}`;
      const [fin, ordSum, matUse, empStats, t] = await Promise.all([
        isDirector ? api.get(`/api/reports/finance${q}`) : Promise.resolve(null),
        isManager  ? api.get(`/api/reports/orders-summary${q}`).catch(() => null) : Promise.resolve(null),
        isManager  ? api.get(`/api/reports/material-usage${q}`).catch(() => []) : Promise.resolve([]),
        isDirector ? api.get(`/api/reports/employee-stats${q}`).catch(() => []) : Promise.resolve([]),
        api.get('/api/tasks?done=0').catch(() => []),
      ]);
      setSummary(fin);
      setOrdersBreakdown(ordSum);
      setMaterialUsage(matUse || []);
      setEmployeeStats(empStats || []);
      setTasks(t || []);
    } catch { setError(true); } finally { setLoading(false); }
  }, [activeRange.from, activeRange.to, isDirector, isManager]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period]);
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
    <main className="dashboard-page slide-up">
      <header className="dashboard-topbar">
        <h1 className="dashboard-brand">Tamga Service</h1>
        {canUsePeriods && (
          <PeriodSelector period={period} onChange={setPeriod} />
        )}
        {isDirector ? (
          <button className="dashboard-export-btn" onClick={exportCsv}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v11" /><path d="m8 10 4 4 4-4" /><path d="M5 21h14" /></svg>
            Экспорт CSV
          </button>
        ) : (
          <div className="dashboard-topbar-spacer" />
        )}
      </header>

      {period === 'custom' && canUsePeriods && (
        <div className="dashboard-custom-range card">
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

      <section className="dashboard-content">
        {loading ? (
          <div className="dashboard-loading"><div className="spinner"></div></div>
        ) : error ? (
          <div className="dashboard-error">Ошибка загрузки</div>
        ) : (
          <>
            {isDirector && summary && (
              <DirectorView fin={summary} employeeStats={employeeStats} tasks={tasks} onToggleTask={toggleTask} lang={lang} />
            )}
            {!isDirector && isManager && ordersBreakdown && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="stat-card stat-card-blue">
                  <div className="stat-label">Заказов</div>
                  <div className="stat-value number-animate">{ordersBreakdown.totals.total_orders}</div>
                </div>
                <div className="stat-card stat-card-green">
                  <div className="stat-label">Выручка</div>
                  <div className="stat-value number-animate" style={{ color: 'var(--success)' }}>
                    {formatCurrency(ordersBreakdown.totals.total_revenue, lang)}
                  </div>
                </div>
              </div>
            )}
            {isManager && ordersBreakdown && ordersBreakdown.by_status?.length > 0 && (
              <OrdersByStatus rows={ordersBreakdown.by_status} lang={lang} />
            )}
            {isManager && materialUsage.length > 0 && (
              <MaterialUsage rows={materialUsage} />
            )}
            {!isDirector && <TasksCard tasks={tasks} onToggle={toggleTask} lang={lang} />}
          </>
        )}
      </section>
    </main>
  );
}

function PeriodSelector({ period, onChange }) {
  return (
    <div className="dashboard-period-selector" role="group" aria-label="Период отчета">
      {PERIODS.map(p => (
        <button
          key={p.id}
          className={`dashboard-period-btn ${p.id === period ? 'active' : ''}`}
          onClick={() => onChange(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function DirectorView({ fin, employeeStats, tasks, onToggleTask, lang }) {
  const expenses = (fin.material_cost || 0) + (fin.payroll || 0) + (fin.penalties || 0);
  const profit = fin.profit || 0;
  const margin = fin.revenue > 0 ? Math.round((profit / fin.revenue) * 100) : 0;
  const progress = Math.max(0, Math.min(100, margin));
  const donutBg = `conic-gradient(#1769ff ${progress}%, #edf2f8 ${progress}% 100%)`;
  const daily = Array.isArray(fin.daily) ? [...fin.daily].reverse() : [];

  return (
    <div className="director-dashboard director-dashboard-reference">
      <section className="dashboard-finance-hero">
        <WaveBackdrop />
        <div className="dashboard-finance-copy">
          <div className="dashboard-eyebrow">Финансы за период</div>
          <div className="dashboard-finance-main">{formatCurrency(fin.revenue, lang)}</div>
          <div className="dashboard-finance-sub">Доход • {fin.orders_count || 0} заказов</div>
        </div>
        <div className="dashboard-margin-wrap">
          <div className="dashboard-margin-gauge" style={{ background: donutBg }}>
            <div className="dashboard-margin-inner">{margin}%</div>
          </div>
          <div className="dashboard-finance-sub">Маржа</div>
        </div>
      </section>

      <section className="dashboard-kpi-grid">
        <Kpi kind="revenue" label="Доход" value={fin.revenue} color="#1769ff" lang={lang} />
        <Kpi kind="expenses" label="Расходы" value={expenses} color="#ef5148" lang={lang} />
        <Kpi kind="profit" label="Прибыль" value={profit} color="#10b981" lang={lang} />
        <Kpi kind="fines" label="Штрафы" value={fin.penalties || 0} color="#f59b13" lang={lang} />
      </section>

      <section className="dashboard-main-grid">
        <div className="dashboard-panel dashboard-trend-panel">
          <div className="dashboard-panel-head">
            <div>
              <h2 className="dashboard-panel-title">Тренд: доход и расходы</h2>
              <div className="dashboard-chart-legend">
                <span><i className="legend-dot legend-dot-rev"></i> Доход</span>
                <span><i className="legend-dot legend-dot-cost"></i> Расходы</span>
              </div>
            </div>
            <button className="dashboard-chart-select" type="button">По дням <span>⌄</span></button>
          </div>
          <FinanceLines daily={daily} />
        </div>

        <div className="dashboard-panel dashboard-expense-panel">
          <h2 className="dashboard-panel-title">Структура расходов</h2>
          <ExpenseStructure material={fin.material_cost || 0} payroll={fin.payroll || 0} penalties={fin.penalties || 0} lang={lang} />
        </div>
      </section>

      <section className="dashboard-bottom-grid">
        <EmployeeStats rows={employeeStats} lang={lang} />
        <TasksCard tasks={tasks} onToggle={onToggleTask} lang={lang} />
      </section>

      <TopServices items={fin.top_services || []} lang={lang} />
    </div>
  );
}

function WaveBackdrop() {
  return (
    <svg className="dashboard-wave-backdrop" viewBox="0 0 900 160" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 132 C170 102 265 150 420 110 S680 44 900 84" />
      <path d="M0 118 C160 86 285 132 430 96 S690 30 900 68" />
      <path d="M0 104 C170 70 300 116 445 82 S700 18 900 54" />
      <path d="M0 91 C170 57 315 102 460 70 S715 7 900 42" />
    </svg>
  );
}

function Kpi({ kind, label, value, color, lang }) {
  return (
    <div className={`dashboard-kpi-card dashboard-kpi-${kind}`}>
      <div className="dashboard-kpi-icon">{KPI_ICONS[kind]}</div>
      <div>
        <div className="dashboard-kpi-label">{label}</div>
        <div className="dashboard-kpi-value" style={{ color }}>{formatCurrency(value, lang)}</div>
        <div className="dashboard-kpi-sub">—</div>
      </div>
    </div>
  );
}

function FinanceLines({ daily }) {
  const source = daily.length ? daily : EMPTY_DAILY;
  const width = 720;
  const height = 230;
  const left = 52;
  const right = 14;
  const top = 18;
  const bottom = 184;
  const chartW = width - left - right;
  const chartH = bottom - top;
  const rev = source.map(d => Number(d.revenue || 0));
  const cost = source.map(d => Number(d.cost || 0));
  const maxVal = Math.max(100000, ...rev, ...cost);
  const yTicks = [100000, 80000, 60000, 40000, 20000, 0];
  const month = 'мая';
  const xTicks = [
    { i: 0, label: `1 ${month}` },
    { i: Math.round((source.length - 1) * 0.25), label: `5 ${month}` },
    { i: Math.round((source.length - 1) * 0.45), label: `10 ${month}` },
    { i: Math.round((source.length - 1) * 0.65), label: `15 ${month}` },
    { i: Math.round((source.length - 1) * 0.82), label: `20 ${month}` },
    { i: source.length - 1, label: `31 ${month}` },
  ];

  const point = (v, i, count) => {
    const x = left + (i * chartW) / Math.max(1, count - 1);
    const y = bottom - (v / maxVal) * chartH;
    return { x, y };
  };
  const toPoints = (vals) => vals.map((v, i) => {
    const p = point(v, i, vals.length);
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(' ');
  const areaPoints = (vals) => `${left},${bottom} ${toPoints(vals)} ${left + chartW},${bottom}`;

  return (
    <div className="dashboard-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="dashboard-line-chart" preserveAspectRatio="none">
        <defs>
          <linearGradient id="dashRevFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2f7cff" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#2f7cff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="dashCostFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ef5148" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#ef5148" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map(t => {
          const y = bottom - (t / maxVal) * chartH;
          return (
            <g key={t}>
              <text x="6" y={y + 4} className="dashboard-axis-label">{t === 0 ? '0' : `${Math.round(t / 1000)}k`}</text>
              <line x1={left} x2={width - right} y1={y} y2={y} className="dashboard-grid-line" />
            </g>
          );
        })}
        <polygon points={areaPoints(cost)} fill="url(#dashCostFill)" />
        <polygon points={areaPoints(rev)} fill="url(#dashRevFill)" />
        <polyline points={toPoints(cost)} className="dashboard-line-cost" />
        <polyline points={toPoints(rev)} className="dashboard-line-rev" />
        {cost.map((v, i) => {
          const p = point(v, i, cost.length);
          return <circle key={`c-${i}`} cx={p.x} cy={p.y} r="4" className="dashboard-chart-dot dashboard-chart-dot-cost" />;
        })}
        {rev.map((v, i) => {
          const p = point(v, i, rev.length);
          return <circle key={`r-${i}`} cx={p.x} cy={p.y} r="4" className="dashboard-chart-dot dashboard-chart-dot-rev" />;
        })}
        {xTicks.map(t => {
          const x = left + (t.i * chartW) / Math.max(1, source.length - 1);
          return <text key={`${t.i}-${t.label}`} x={x} y="220" className="dashboard-x-label">{t.label}</text>;
        })}
      </svg>
    </div>
  );
}

function ExpenseStructure({ material, payroll, penalties, lang }) {
  const sum = material + payroll + penalties;
  const total = Math.max(1, sum);
  const mPct = Math.round((material / total) * 100);
  const pPct = Math.round((payroll / total) * 100);
  const penPct = sum === 0 ? 100 : Math.max(0, 100 - mPct - pPct);
  const gradient = sum === 0
    ? 'conic-gradient(#764df0 0% 100%)'
    : `conic-gradient(#764df0 0% ${mPct}%, #f7a11b ${mPct}% ${mPct + pPct}%, #dc4bd7 ${mPct + pPct}% 100%)`;

  return (
    <div className="dashboard-expense-structure">
      <div className="dashboard-expense-donut" style={{ background: gradient }}>
        <div className="dashboard-expense-inner">
          <strong>{formatCurrency(sum, lang)}</strong>
          <span>{sum === 0 ? '100%' : `${Math.round((sum / total) * 100)}%`}</span>
        </div>
      </div>
      <div className="dashboard-expense-legend">
        <LegendRow label="Материалы" value={material} color="#764df0" pct={mPct} lang={lang} />
        <LegendRow label="Зарплаты" value={payroll} color="#f7a11b" pct={pPct} lang={lang} />
        <LegendRow label="Штрафы" value={penalties} color="#dc4bd7" pct={penPct} lang={lang} />
      </div>
    </div>
  );
}

function LegendRow({ label, value, color, pct, lang }) {
  return (
    <div className="dashboard-legend-row">
      <span className="dashboard-legend-name"><i className="legend-dot" style={{ background: color }}></i>{label}</span>
      <span className="dashboard-legend-value">{formatCurrency(value, lang)} ({pct}%)</span>
    </div>
  );
}

function TopServices({ items, lang }) {
  if (!items.length) return null;
  const maxRev = Math.max(...items.map(s => Number(s.revenue || 0)), 1);
  return (
    <div className="dashboard-panel dashboard-top-services">
      <div className="dashboard-panel-title">Топ услуг</div>
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

function OrdersByStatus({ rows, lang }) {
  const totalCount = rows.reduce((s, r) => s + (r.count || 0), 0);
  const totalRev = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);
  return (
    <div className="card mb-4">
      <div className="dash-title">Заказы по статусам</div>
      <div className="status-grid">
        {rows.map(r => {
          const pct = totalCount > 0 ? Math.round((r.count / totalCount) * 100) : 0;
          return (
            <div key={r.status} className="status-tile">
              <div className="status-tile-head">
                <span className={statusBadgeClass(r.status)}>{statusLabel(r.status, lang)}</span>
                <span className="status-tile-pct">{pct}%</span>
              </div>
              <div className="status-tile-count">{r.count}</div>
              <div className="status-tile-sub">{formatCurrency(r.revenue, lang)}</div>
            </div>
          );
        })}
      </div>
      <div className="status-total">
        Всего: <b>{totalCount}</b> заказ{totalCount === 1 ? '' : totalCount < 5 ? 'а' : 'ов'}
        <span style={{ marginLeft: 'auto' }}>{formatCurrency(totalRev, lang)}</span>
      </div>
    </div>
  );
}

function MaterialUsage({ rows }) {
  const max = Math.max(1, ...rows.map(m => Number(m.used) || 0));
  return (
    <div className="card mb-4">
      <div className="dash-title">Расход материалов</div>
      <div className="space-y-3">
        {rows.map((m, i) => {
          const used = Number(m.used) || 0;
          const pct = Math.max(2, Math.round((used / max) * 100));
          return (
            <div key={i}>
              <div className="flex justify-between text-sm mb-1 gap-2">
                <span className="truncate">{m.name_ru}</span>
                <span className="font-bold">{used.toFixed(1)} {m.unit}</span>
              </div>
              <div className="usage-bar">
                <div className="usage-bar-fill" style={{ width: `${pct}%` }}></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmployeeStats({ rows, lang }) {
  const data = rows.length ? rows : [];
  return (
    <div className="dashboard-panel dashboard-employee-panel">
      <h2 className="dashboard-panel-title">Сотрудники</h2>
      <div className="dashboard-employee-list">
        {data.length === 0 ? (
          <div className="dashboard-employee-empty">Нет данных по сотрудникам</div>
        ) : data.map(e => (
          <div key={e.id} className="dashboard-employee-card">
            <div className="dashboard-employee-head">
              <div className="dashboard-employee-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>
              </div>
              <div>
                <div className="dashboard-employee-name">{e.full_name}</div>
                <div className="dashboard-employee-role">{roleLabel(e.role, lang)}</div>
              </div>
            </div>
            <div className="dashboard-employee-stats">
              <div><span>Дней</span><strong>{e.days_worked}</strong></div>
              <div><span>Задач</span><strong>{e.tasks_done}</strong></div>
              <div><span>Инцид.</span><strong className={e.incidents > 0 ? 'text-red-600' : ''}>{e.incidents}</strong></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TasksCard({ tasks, onToggle, lang }) {
  if (!tasks.length) {
    return (
      <div className="dashboard-panel dashboard-tasks-panel dashboard-tasks-empty">
        <div className="dashboard-empty-illustration">
          <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
            <rect x="24" y="18" width="48" height="62" rx="4" stroke="currentColor" strokeWidth="5" />
            <path d="M39 12h18a4 4 0 0 1 4 4v8H35v-8a4 4 0 0 1 4-4Z" fill="currentColor" opacity="0.35" />
            <path d="m35 47 8 8 14-16M35 65l8 8 12-14" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
            <circle cx="70" cy="66" r="18" fill="#415a7f" />
            <path d="m61 66 7 7 14-17" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="dashboard-empty-title">Нет активных задач</div>
        <div className="dashboard-empty-sub">Здесь появятся ваши задачи</div>
      </div>
    );
  }
  return (
    <div className="dashboard-panel dashboard-tasks-panel">
      <div className="dashboard-tasks-head">
        <h2 className="dashboard-panel-title">Мои задачи</h2>
        <span className="badge" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>{tasks.length}</span>
      </div>
      <div className="dashboard-task-list">
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
          <Link to="/tasks" className="dashboard-show-all">
            Показать все ({tasks.length})...
          </Link>
        )}
      </div>
    </div>
  );
}
