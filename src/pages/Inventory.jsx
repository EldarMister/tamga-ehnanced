import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useModal } from '../components/Modal.jsx';
import { formatDateTime } from '../lib/utils.js';
import { useRealtime } from '../lib/useRealtime.js';

const ACTION_LABELS = {
  receive: '📦 Приход', reserve: '🔒 Резерв', unreserve: '🔓 Возврат',
  consume: '🖨 Списание', correction: '📝 Коррекция', defect: '❌ Брак',
};

// Чистые SVG-иконки в стиле Heroicons (outline). Без emoji.
const CUBE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <path d="m3.27 6.96 8.73 5.04 8.73-5.04M12 22.08V12" />
  </svg>
);
const ROLL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="6" rx="6" ry="2" />
    <path d="M6 6v12c0 1.1 2.7 2 6 2s6-.9 6-2V6" />
    <path d="M6 12c0 1.1 2.7 2 6 2s6-.9 6-2" />
  </svg>
);
const GRID = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 9h16M4 14h16M9 4v16M14 4v16" />
  </svg>
);
const SEARCH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
);
const CHECK_CIRCLE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" />
  </svg>
);
const ALERT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" />
  </svg>
);
const X_CIRCLE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" />
  </svg>
);
const HISTORY = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
);
const SORT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h13M3 12h9M3 18h5" />
  </svg>
);

// Иконка и тон по коду материала
function materialIcon(code) {
  const c = String(code || '').toLowerCase();
  if (c.includes('banner')) return { svg: CUBE,  tone: 'mint' };
  if (c.includes('mesh'))   return { svg: GRID,  tone: 'pink' };
  if (c.includes('vinyl') || c.includes('samokley')) return { svg: ROLL, tone: 'amber' };
  if (c.includes('dtf'))    return { svg: <span className="inv-icon-text">DTF</span>, tone: 'pink' };
  if (c.includes('oracal') || c.includes('plotter')) return { svg: ROLL, tone: 'pink' };
  return { svg: CUBE, tone: 'blue' };
}

// Классификация состояния материала по доступному остатку.
function statusOf(m) {
  const available = (m.quantity || 0) - (m.reserved || 0);
  if (available <= 0) return 'none';
  if (available < (m.low_threshold || 0)) return 'low';
  return 'normal';
}

const STATUS_META = {
  normal: { label: 'В НОРМЕ', cls: 'inv-status-normal' },
  low:    { label: 'МАЛО',    cls: 'inv-status-low' },
  none:   { label: 'НЕТ',     cls: 'inv-status-none' },
};

// Процент заполненности для прогресс-бара. 100% = десятикратный low_threshold или roll_size.
function stockPct(m) {
  const available = Math.max(0, (m.quantity || 0) - (m.reserved || 0));
  const fullStock = Math.max((m.low_threshold || 1) * 10, m.roll_size || 0, 1);
  return Math.min(100, Math.round((available / fullStock) * 100));
}

export default function Inventory() {
  const { user, lang } = useAuth();
  const showToast = useToast();
  const { showForm, showCustom } = useModal();
  const [materials, setMaterials] = useState(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | low | none | normal
  const [sortBy] = useState('name');
  const canManage = ['director', 'manager'].includes(user.role);

  const load = useCallback(async () => {
    setError(false);
    try {
      api.clearCache('/api/inventory');
      const data = await api.get('/api/inventory');
      setMaterials(data || []);
    } catch { setError(true); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useRealtime(['inventory:changed', 'orders:changed'], load);

  // ─── KPI и фильтрация ───────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const list = materials || [];
    const c = { total: list.length, normal: 0, low: 0, none: 0 };
    for (const m of list) c[statusOf(m)]++;
    return c;
  }, [materials]);

  const visible = useMemo(() => {
    let list = (materials || []).slice();
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(m =>
      String(m.name_ru || '').toLowerCase().includes(q) ||
      String(m.code || '').toLowerCase().includes(q));
    if (filter !== 'all') list = list.filter(m => statusOf(m) === filter);
    if (sortBy === 'name') list.sort((a, b) => String(a.name_ru).localeCompare(String(b.name_ru), 'ru'));
    return list;
  }, [materials, search, filter, sortBy]);

  // ─── Действия ───────────────────────────────────────────────────────────
  const showReceive = (id, name) => {
    showForm({
      title: `Приход: ${name}`,
      fields: [
        { name: 'quantity', label: 'Количество (м²)', type: 'number', required: true, step: '0.1', placeholder: '0' },
        { name: 'note',     label: 'Примечание',     type: 'text',   placeholder: 'Поставщик, накладная...' },
      ],
      submitText: 'Принять',
      onSubmit: async (data) => {
        const qty = parseFloat(data.quantity);
        if (!qty || qty <= 0) { showToast('Введите количество', 'warning'); return; }
        try { await api.post(`/api/inventory/${id}/receive`, { quantity: qty, note: data.note });
          showToast('Материал принят', 'success'); load();
        } catch {}
      },
    });
  };
  const showCorrection = (id, name) => {
    showForm({
      title: `Корректировка: ${name}`,
      fields: [
        { name: 'quantity', label: 'Количество (+/-)', type: 'number', required: true, step: '0.1', placeholder: 'напр. -5 или +10' },
        { name: 'note',     label: 'Причина',          type: 'text',   required: true, placeholder: 'Инвентаризация, ошибка...' },
      ],
      submitText: 'Применить',
      onSubmit: async (data) => {
        const qty = parseFloat(data.quantity);
        if (!qty) { showToast('Введите количество', 'warning'); return; }
        try { await api.post(`/api/inventory/${id}/correction`, { quantity: qty, note: data.note });
          showToast('Корректировка применена', 'success'); load();
        } catch {}
      },
    });
  };
  const showLedger = (id, name) =>
    showCustom((close) => <Ledger id={id} name={name} onClose={close} lang={lang} />);

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="page-header"><h1 className="page-title">Склад</h1><div></div></div>

      <div className="px-4 space-y-4 pb-8">
        {/* KPI карточки */}
        <div className="inv-kpi-grid">
          <KpiCard tone="blue"   icon={CUBE}        title="Всего материалов" value={kpi.total} sub="Единиц учёта" />
          <KpiCard tone="mint"   icon={CHECK_CIRCLE} title="В норме"          value={kpi.normal}
                   sub={kpi.total ? `${Math.round(kpi.normal/kpi.total*100)}% от всех материалов` : '—'} />
          <KpiCard tone="amber"  icon={ALERT}       title="Мало"             value={kpi.low}
                   sub={kpi.total ? `${Math.round(kpi.low/kpi.total*100)}% от всех материалов` : '—'} />
          <KpiCard tone="rose"   icon={X_CIRCLE}    title="Нет в наличии"     value={kpi.none}
                   sub={kpi.total ? `${Math.round(kpi.none/kpi.total*100)}% от всех материалов` : '—'} />
        </div>

        {/* Поиск + фильтры + сортировка */}
        <div className="inv-toolbar">
          <div className="inv-search">
            <span className="inv-search-icon">{SEARCH}</span>
            <input
              className="inv-search-input"
              placeholder="Поиск материала"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="inv-chips">
            <Chip label="Все"        count={kpi.total}  active={filter === 'all'}    onClick={() => setFilter('all')} />
            <Chip label="Мало"       count={kpi.low}    active={filter === 'low'}    onClick={() => setFilter('low')}    tone="amber" />
            <Chip label="Нет"        count={kpi.none}   active={filter === 'none'}   onClick={() => setFilter('none')}   tone="rose" />
            <Chip label="В наличии"  count={kpi.normal} active={filter === 'normal'} onClick={() => setFilter('normal')} tone="mint" />
          </div>
          <div className="inv-sort">
            <span>По названию</span>
            <span className="inv-sort-icon">{SORT}</span>
          </div>
        </div>

        {/* Список материалов */}
        <div className="inv-list">
          {error ? <div className="text-center text-red-500 py-8">Ошибка загрузки</div>
            : materials === null ? <div className="flex justify-center py-8"><div className="spinner"></div></div>
            : visible.length === 0 ? (
              <div className="empty-state">
                <p className="text-lg font-medium">Ничего не найдено</p>
                <p className="text-sm mt-1">Попробуйте сбросить фильтры или поиск</p>
              </div>
            )
            : visible.map(m => (
              <MaterialRow
                key={m.id}
                m={m}
                canManage={canManage}
                onReceive={() => showReceive(m.id, m.name_ru)}
                onCorrect={() => showCorrection(m.id, m.name_ru)}
                onLedger={() => showLedger(m.id, m.name_ru)}
              />
            ))}
        </div>
      </div>
    </>
  );
}

function KpiCard({ tone, icon, title, value, sub }) {
  return (
    <div className="inv-kpi">
      <div className={`inv-kpi-icon inv-kpi-icon-${tone}`}>{icon}</div>
      <div className="inv-kpi-text">
        <div className="inv-kpi-title">{title}</div>
        <div className="inv-kpi-value">{value}</div>
        <div className="inv-kpi-sub">{sub}</div>
      </div>
    </div>
  );
}

function Chip({ label, count, active, onClick, tone }) {
  return (
    <button
      className={`inv-chip ${active ? 'inv-chip-active' : ''} ${tone ? `inv-chip-${tone}` : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="inv-chip-count">{count}</span>
    </button>
  );
}

function MaterialRow({ m, canManage, onReceive, onCorrect, onLedger }) {
  const status = statusOf(m);
  const meta = STATUS_META[status];
  const pct = stockPct(m);
  const available = Math.max(0, (m.quantity || 0) - (m.reserved || 0));
  const { svg, tone } = materialIcon(m.code);
  return (
    <div className={`inv-row inv-row-${status}${canManage ? '' : ' inv-row-no-actions'}`}>
      <div className={`inv-row-icon inv-row-icon-${tone}`}>{svg}</div>

      <div className="inv-row-name">
        <div className="inv-row-title">{m.name_ru}</div>
        <div className="inv-row-unit">{m.unit}</div>
      </div>

      <div className="inv-row-bar">
        <div className="inv-bar"><div className={`inv-bar-fill inv-bar-${status}`} style={{ width: `${pct}%` }}></div></div>
        <div className={`inv-bar-pct inv-bar-pct-${status}`}>{pct}%</div>
      </div>

      <div className="inv-row-stats">
        <div className="inv-stat"><div className="inv-stat-label">На складе</div><div className={`inv-stat-value inv-stat-value-${status}`}>{(m.quantity || 0).toFixed(1)}</div></div>
        <div className="inv-stat"><div className="inv-stat-label">Резерв</div><div className="inv-stat-value inv-stat-value-reserve">{(m.reserved || 0).toFixed(1)}</div></div>
        <div className="inv-stat"><div className="inv-stat-label">Доступно</div><div className={`inv-stat-value inv-stat-value-${status}`}>{available.toFixed(1)}</div></div>
      </div>

      {canManage && (
        <div className="inv-row-actions">
          <button className="btn btn-primary inv-btn" onClick={onReceive}>+ Приход</button>
          <button className="btn btn-outline inv-btn" onClick={onCorrect}>± Коррекция</button>
          <button className="btn btn-ghost inv-btn-icon" onClick={onLedger} title="История">
            {HISTORY}
          </button>
        </div>
      )}

      <div className={`inv-row-status ${meta.cls}`}>{meta.label}</div>
    </div>
  );
}

function Ledger({ id, name, onClose, lang }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get(`/api/inventory/${id}/ledger?limit=30`)
      .then(setEntries)
      .catch(() => setError(true));
  }, [id]);

  if (error) return <div className="p-6 text-center text-red-500">Ошибка загрузки</div>;
  if (!entries) return <div className="p-6"><div className="flex justify-center"><div className="spinner"></div></div></div>;

  return (
    <div className="p-6">
      <h3 className="font-bold text-lg mb-4">История: {name}</h3>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {entries.length ? entries.map((e, i) => (
          <div key={i} className="flex items-center justify-between text-sm border-b pb-2">
            <div>
              <div className="font-medium">{ACTION_LABELS[e.action] || e.action}</div>
              <div className="text-gray-400">{e.full_name} • {formatDateTime(e.created_at, lang)}</div>
              {e.note && <div className="text-gray-500 text-xs">{e.note}</div>}
              {e.order_number && <div className="text-blue-600 text-xs">{e.order_number}</div>}
            </div>
            <div className={`font-bold ${e.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {e.quantity > 0 ? '+' : ''}{e.quantity.toFixed(1)}
            </div>
          </div>
        )) : <p className="text-gray-400 text-center">Нет записей</p>}
      </div>
      <button className="btn btn-secondary btn-block mt-4" onClick={onClose}>Закрыть</button>
    </div>
  );
}
