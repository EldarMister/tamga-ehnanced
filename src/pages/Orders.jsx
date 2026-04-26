import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useRealtime } from '../lib/useRealtime.js';
import { useToast } from '../components/Toast.jsx';
import { useModal } from '../components/Modal.jsx';
import { formatCurrency, formatDate, statusLabel, isOverdue, buildUploadUrl, openImageViewer } from '../lib/utils.js';

const STATUS_FILTERS = [
  { value: '', label: 'Все' },
  { value: 'created', label: 'Новые' },
  { value: 'design', label: 'Дизайн' },
  { value: 'production', label: 'Производство' },
  { value: 'ready', label: 'Готовые' },
  { value: 'closed', label: 'Закрытые' },
  { value: 'defect', label: 'Брак' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Сначала новые' },
  { value: 'price_desc', label: 'Сначала по дороже' },
];

const NEXT_STATUS = {
  created: { label: 'Передать в дизайн', status: 'design', roles: ['manager', 'director'] },
  design: { label: 'В производство', status: 'production', roles: ['designer', 'manager', 'director'] },
  production: { label: 'Готов к выдаче', status: 'ready', roles: ['master', 'manager', 'director'] },
  ready: { label: 'Выдан клиенту', status: 'closed', roles: ['manager', 'director'] },
  design_done: { label: 'В производство', status: 'production', roles: ['manager', 'director', 'master'] },
  printed: { label: 'Готов к выдаче', status: 'ready', roles: ['manager', 'director'] },
  postprocess: { label: 'Готов к выдаче', status: 'ready', roles: ['assistant', 'manager', 'director'] },
};

const STATUS_TONE = {
  created: 'blue',
  design: 'violet',
  production: 'amber',
  ready: 'green',
  closed: 'slate',
  cancelled: 'rose',
  defect: 'orange',
  design_done: 'violet',
  printed: 'amber',
  postprocess: 'violet',
};

const SVG = {
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  sort: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4v14" />
      <path d="m3 8 4-4 4 4" />
      <path d="M17 20V6" />
      <path d="m13 16 4 4 4-4" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H9l1.3-2h3.4L15 6h2.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  ),
  order: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 5H6.8A2.8 2.8 0 0 0 4 7.8v11.4A2.8 2.8 0 0 0 6.8 22h10.4a2.8 2.8 0 0 0 2.8-2.8V7.8A2.8 2.8 0 0 0 17.2 5H16" />
      <rect x="8" y="2" width="8" height="5" rx="1.5" />
    </svg>
  ),
  box: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.8 21 7.7v8.6l-9 4.9-9-4.9V7.7l9-4.9Z" />
      <path d="m3.4 7.9 8.6 4.8 8.6-4.8" />
      <path d="M12 12.7v8.1" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 15-4.5-4.5L7 20" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v4M16 2v4" />
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5.5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18.5" cy="12" r="1.7" />
    </svg>
  ),
  open: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6" />
      <path d="M10 14 20 4" />
      <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
    </svg>
  ),
  advance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 5 7 7-7 7" />
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16.5v1.5A2 2 0 0 0 6 20h12a2 2 0 0 0 2-2v-1.5" />
    </svg>
  ),
  defect: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  ),
  cancel: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6" />
      <path d="m15 9-6 6" />
    </svg>
  ),
};

function useDismissibleLayer(ref, open, onClose) {
  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, ref]);
}

function formatQuantity(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return String(value || '');
  if (Number.isInteger(numeric)) return String(numeric);
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(numeric);
}

function servicesLabel(count) {
  const value = Number(count || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} услуга`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} услуги`;
  return `${value} услуг`;
}

function mainServiceLabel(item) {
  if (!item) return '—';
  const unit = String(item.unit || '').trim();
  const amount = formatQuantity(item.quantity);
  return `${item.name_ru}${amount ? ` • ${amount}${unit ? ` ${unit}` : ''}` : ''}`;
}

function orderStatusTone(status) {
  return STATUS_TONE[status] || 'slate';
}

export default function Orders() {
  const { user, lang } = useAuth();
  const navigate = useNavigate();
  const canCreate = ['director', 'manager'].includes(user.role);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(false);
  const debRef = useRef();

  const load = useCallback(async () => {
    api.clearCache('/api/orders');
    setError(false);
    try {
      let url = `/api/orders?limit=50&status=${filter}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      const data = await api.get(url);
      setOrders(data?.orders || []);
    } catch {
      setError(true);
    }
  }, [filter, search]);

  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(load, 400);
    return () => clearTimeout(debRef.current);
  }, [load]);

  useRealtime('orders:changed', load);

  const visibleOrders = useMemo(() => {
    const list = Array.isArray(orders) ? [...orders] : [];
    if (sortBy === 'price_desc') {
      list.sort((a, b) => {
        const priceDiff = Number(b.total_price || 0) - Number(a.total_price || 0);
        if (priceDiff !== 0) return priceDiff;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
    }
    return list;
  }, [orders, sortBy]);

  return (
    <main className="orders-page slide-up">
      <header className="orders-page-header">
        <h1 className="orders-page-title">Заказы</h1>
      </header>

      <section className="orders-toolbar">
        <label className="orders-search-shell" aria-label="Поиск заказов">
          <span className="orders-search-icon">{SVG.search}</span>
          <input
            type="search"
            className="orders-search-input"
            placeholder="Поиск по номеру или клиенту..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="orders-filter-row">
          <div className="orders-filter-chips" role="tablist" aria-label="Фильтры заказов">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status.value || 'all'}
                type="button"
                className={`orders-filter-chip ${status.value === filter ? 'is-active' : ''}`}
                onClick={() => setFilter(status.value)}
              >
                {status.label}
              </button>
            ))}
          </div>

          <SortDropdown value={sortBy} onChange={setSortBy} />
        </div>
      </section>

      <section className="orders-list" aria-live="polite">
        {error ? (
          <div className="orders-feedback orders-feedback-error">Ошибка загрузки</div>
        ) : orders === null ? (
          <div className="orders-feedback"><div className="spinner"></div></div>
        ) : visibleOrders.length === 0 ? (
          <div className="orders-empty-state">
            <div className="orders-empty-icon">{SVG.order}</div>
            <p className="orders-empty-title">Заказов нет</p>
            <p className="orders-empty-text">Попробуйте изменить поиск или создайте новый заказ.</p>
          </div>
        ) : visibleOrders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            lang={lang}
            userRole={user.role}
            onOpen={() => navigate(`/orders/${order.id}`)}
            onReload={load}
          />
        ))}
      </section>

      {canCreate && (
        <button
          className="fab orders-fab"
          onClick={() => navigate('/orders/new')}
          aria-label="Новый заказ"
          title="Новый заказ"
        >
          +
        </button>
      )}
    </main>
  );
}

function SortDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useDismissibleLayer(ref, open, () => setOpen(false));

  const currentLabel = SORT_OPTIONS.find((option) => option.value === value)?.label || SORT_OPTIONS[0].label;

  return (
    <div className="orders-sort" ref={ref}>
      <button
        type="button"
        className={`orders-sort-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((state) => !state)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="orders-sort-trigger-icon">{SVG.sort}</span>
        <span>{currentLabel}</span>
        <span className="orders-sort-trigger-caret">{SVG.chevron}</span>
      </button>

      {open && (
        <div className="orders-sort-menu" role="menu">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`orders-sort-menu-item ${option.value === value ? 'is-active' : ''}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="menuitem"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, lang, userRole, onOpen, onReload }) {
  const showToast = useToast();
  const { showConfirm, showForm } = useModal();
  const [imgError, setImgError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const menuRef = useRef(null);
  const uploadRef = useRef(null);

  useDismissibleLayer(menuRef, menuOpen, () => setMenuOpen(false));

  const items = Array.isArray(order.items) ? order.items : [];
  const itemsCount = items.length;
  const mainItem = items[0];
  const serviceLine = mainServiceLabel(mainItem);
  const overdue = isOverdue(order);
  const nextAction = NEXT_STATUS[order.status];
  const isManager = ['manager', 'director'].includes(userRole);
  const closedSet = ['closed', 'cancelled', 'defect'];
  const canAdvance = nextAction && nextAction.roles.includes(userRole);
  const canCancel = isManager && !closedSet.includes(order.status);
  const canMarkDefect = canCancel;
  const canUploadDesign = ['designer', 'manager', 'director'].includes(userRole) && ['design', 'created'].includes(order.status);
  const photoUrl = order.photo_url || buildUploadUrl(order.photo_file);
  const hasPhoto = !!(order.photo_url || order.photo_file);
  const hasDesign = !!String(order.design_file || '').trim();
  const displayDate = order.deadline ? formatDate(order.deadline, lang) : formatDate(order.created_at, lang);
  const metaItems = [servicesLabel(itemsCount)];

  if (hasPhoto) metaItems.push('Есть фото');
  metaItems.push(hasDesign ? 'Макет загружен' : 'Без макета');

  const advanceOrder = () => {
    if (!nextAction) return;
    showConfirm({
      title: 'Подтверждение',
      body: `Перевести заказ в статус "${nextAction.label}"?`,
      onConfirm: async () => {
        try {
          await api.patch(`/api/orders/${order.id}/status`, { status: nextAction.status });
          showToast('Статус обновлён', 'success');
          onReload();
        } catch {}
      },
    });
  };

  const markDefect = () => {
    showForm({
      title: 'Отметить как Брак',
      fields: [
        {
          type: 'select',
          name: 'caused_by',
          label: 'Виновник',
          options: [
            { value: 'manager', label: 'Менеджер' },
            { value: 'designer', label: 'Дизайнер' },
            { value: 'master', label: 'Печатник' },
          ],
        },
        {
          type: 'textarea',
          name: 'description',
          label: 'Описание брака',
          placeholder: 'Опишите проблему...',
        },
      ],
      submitText: 'Отметить как Брак',
      onSubmit: async (data) => {
        try {
          const causeLabels = {
            manager: 'Менеджер',
            designer: 'Дизайнер',
            master: 'Печатник',
          };
          const note = `Виновник: ${causeLabels[data.caused_by] || data.caused_by}. ${data.description || ''}`.trim();
          await api.patch(`/api/orders/${order.id}/status`, { status: 'defect', note });
          showToast('Заказ отмечен как брак', 'warning');
          onReload();
        } catch {}
      },
    });
  };

  const cancelOrder = () => {
    showConfirm({
      title: 'Отмена заказа',
      body: 'Вы уверены? Зарезервированный материал вернётся на склад.',
      confirmText: 'Отменить заказ',
      danger: true,
      onConfirm: async () => {
        try {
          await api.patch(`/api/orders/${order.id}/status`, { status: 'cancelled' });
          showToast('Заказ отменён', 'warning');
          onReload();
        } catch {}
      },
    });
  };

  const handleDesignUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadBusy(true);
    try {
      await api.upload(`/api/orders/${order.id}/design`, file);
      showToast('Макет загружен', 'success');
      onReload();
    } catch {
      // API layer already shows toast.
    } finally {
      event.target.value = '';
      setUploadBusy(false);
    }
  };

  const actions = [
    {
      key: 'open',
      label: 'Открыть заказ',
      icon: SVG.open,
      tone: 'blue',
      onClick: () => onOpen(),
    },
    canAdvance ? {
      key: 'advance',
      label: nextAction.label,
      icon: SVG.advance,
      tone: 'violet',
      onClick: advanceOrder,
    } : null,
    canUploadDesign ? {
      key: 'upload',
      label: uploadBusy ? 'Загрузка макета...' : 'Загрузить макет',
      icon: SVG.upload,
      tone: 'amber',
      onClick: () => uploadRef.current?.click(),
      disabled: uploadBusy,
    } : null,
    canMarkDefect ? {
      key: 'defect',
      label: 'Отметить как брак',
      icon: SVG.defect,
      tone: 'orange',
      onClick: markDefect,
    } : null,
    canCancel ? {
      key: 'cancel',
      label: 'Отменить заказ',
      icon: SVG.cancel,
      tone: 'rose',
      onClick: cancelOrder,
      danger: true,
    } : null,
  ].filter(Boolean);

  return (
    <article
      className={`orders-card ${overdue ? 'is-overdue' : ''}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Открыть заказ ${order.order_number}`}
    >
      <div className="orders-card-layout">
        <div className="orders-card-media">
          {photoUrl && !imgError ? (
            <img
              src={photoUrl}
              alt="Фото заказа"
              className="orders-card-image"
              loading="lazy"
              onError={() => setImgError(true)}
              onClick={(event) => {
                event.stopPropagation();
                openImageViewer(photoUrl, 'Фото заказа');
              }}
            />
          ) : (
            <div className="orders-card-image-placeholder" aria-hidden="true">
              {SVG.camera}
            </div>
          )}
        </div>

        <div className="orders-card-main">
          <div className="orders-card-orderline">
            <span className="orders-card-order-number">{order.order_number}</span>
            {overdue ? <span className="orders-card-overdue">Просрочен</span> : null}
          </div>
          <h2 className="orders-card-client">{order.client_name}</h2>
          <div className="orders-card-service">
            <span className="orders-card-service-icon">{SVG.order}</span>
            <span>{serviceLine}</span>
          </div>
          <div className="orders-card-meta">
            {metaItems.map((item) => (
              <span key={item} className="orders-card-meta-item">
                <span className="orders-card-meta-icon">
                  {item.includes('услуг') || item.includes('услуга') || item.includes('услуги') ? SVG.box : SVG.image}
                </span>
                <span>{item}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="orders-card-side">
          <div className="orders-card-side-top">
            <StatusBadge status={order.status} lang={lang} />

            <div
              className="orders-card-menu-wrap"
              ref={menuRef}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="orders-card-menu-button"
                aria-label="Быстрые действия"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((state) => !state)}
              >
                {SVG.more}
              </button>

              {menuOpen ? (
                <div className="orders-card-menu" role="menu">
                  {actions.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      className={`orders-card-menu-item orders-card-menu-item-${action.tone}${action.danger ? ' is-danger' : ''}`}
                      onClick={() => {
                        setMenuOpen(false);
                        action.onClick();
                      }}
                      disabled={action.disabled}
                      role="menuitem"
                    >
                      <span className="orders-card-menu-item-icon">{action.icon}</span>
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="orders-card-price">{formatCurrency(order.total_price, lang)}</div>
          <div className="orders-card-date">
            <span className="orders-card-date-icon">{SVG.calendar}</span>
            <span>{displayDate}</span>
          </div>
        </div>
      </div>

      <input
        ref={uploadRef}
        type="file"
        hidden
        accept=".pdf,.cdr,.ai,.jpg,.jpeg,.png"
        onClick={(event) => event.stopPropagation()}
        onChange={handleDesignUpload}
      />
    </article>
  );
}

function StatusBadge({ status, lang }) {
  const tone = orderStatusTone(status);
  return (
    <span className={`orders-status-badge orders-status-badge-${tone}`}>
      <span className="orders-status-badge-dot" />
      <span>{statusLabel(status, lang)}</span>
    </span>
  );
}
