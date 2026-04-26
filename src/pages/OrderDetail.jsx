import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useModal } from '../components/Modal.jsx';
import { formatCurrency, formatDate, formatDateTime, statusLabel, isOverdue, buildUploadUrl, openImageViewer } from '../lib/utils.js';

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
  design: 'amber',
  production: 'violet',
  ready: 'green',
  closed: 'slate',
  cancelled: 'rose',
  defect: 'rose',
  design_done: 'violet',
  printed: 'amber',
  postprocess: 'violet',
};

const SVG = {
  back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
      <path d="M9 12h10" />
    </svg>
  ),
  client: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.87 19.87 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.87 19.87 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6.27 6.27l1.28-1.28a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  photo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m20 15-4.5-4.5L8 18" />
    </svg>
  ),
  services: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  ),
  summary: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </svg>
  ),
  design: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V6" />
      <path d="m8.5 9.5 3.5-3.5 3.5 3.5" />
      <path d="M5 16.5v.5A2 2 0 0 0 7 19h10a2 2 0 0 0 2-2v-.5" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <path d="M12 7.5h.01" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="m9.5 12 1.8 1.8 3.7-3.7" />
    </svg>
  ),
  arrowRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 5 7 7-7 7" />
    </svg>
  ),
  external: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 5h5v5" />
      <path d="M10 14 19 5" />
      <path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
    </svg>
  ),
  imagePlaceholder: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 16-5.5-5.5L8 18" />
    </svg>
  ),
};

function isAreaUnit(unit) {
  if (!unit) return false;
  const normalized = String(unit).toLowerCase().replace(/\s+/g, '');
  return normalized.includes('м2') || normalized.includes('м²') || normalized.includes('m2') || normalized.includes('m²');
}

function clientTypeLabel(type) {
  return type === 'dealer' ? 'Дилер' : 'Розница';
}

function detailStatusClass(status) {
  return `order-detail-status-badge order-detail-status-badge-${STATUS_TONE[status] || 'slate'}`;
}

function SectionHeading({ icon, title, action }) {
  return (
    <div className="order-detail-section-head">
      <div className="order-detail-section-title-wrap">
        <span className="order-detail-section-icon" aria-hidden="true">{icon}</span>
        <h2 className="order-detail-section-title">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, lang } = useAuth();
  const showToast = useToast();
  const { showConfirm, showForm } = useModal();

  const [order, setOrder] = useState(null);
  const [error, setError] = useState(false);
  const [photoBroken, setPhotoBroken] = useState(false);
  const [selectedDesignName, setSelectedDesignName] = useState('');
  const [designBusy, setDesignBusy] = useState(false);

  const designRef = useRef(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      api.clearCache(`/api/orders/${id}`);
      const data = await api.get(`/api/orders/${id}`);
      setOrder(data);
      setPhotoBroken(false);
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return <div className="text-center text-red-500 py-16">Ошибка загрузки заказа</div>;
  }

  if (!order) {
    return <div className="flex justify-center py-16"><div className="spinner"></div></div>;
  }

  const overdue = isOverdue(order);
  const next = NEXT_STATUS[order.status];
  const canAdvance = next && next.roles.includes(user.role);
  const isManager = ['manager', 'director'].includes(user.role);
  const closedSet = ['closed', 'cancelled', 'defect'];
  const canCancel = isManager && !closedSet.includes(order.status);
  const canMarkDefect = canCancel;
  const canUploadDesign = ['designer', 'manager', 'director'].includes(user.role) && ['design', 'created'].includes(order.status);
  const canNotify = isManager && order.status === 'ready';

  const photoUrl = order.photo_url || buildUploadUrl(order.photo_file);
  const designUrl = order.design_file ? `/api/uploads/${order.design_file}` : '';
  const items = Array.isArray(order.items) ? order.items : [];
  const prepaymentAmount = Number(order.prepayment_amount || 0);
  const remainingAmount = Number.isFinite(Number(order.remaining_amount))
    ? Number(order.remaining_amount)
    : Math.max(Number(order.total_price || 0) - prepaymentAmount, 0);
  const showPrepayment = prepaymentAmount > 0;
  const clientType = clientTypeLabel(order.client_type);
  const notes = String(order.notes || '').trim();
  const history = Array.isArray(order.history) ? order.history : [];

  const advance = () => {
    showConfirm({
      title: 'Подтверждение',
      body: `Перевести заказ в статус "${next.label}"?`,
      onConfirm: async () => {
        try {
          await api.patch(`/api/orders/${order.id}/status`, { status: next.status });
          showToast('Статус обновлён', 'success');
          load();
        } catch {}
      },
    });
  };

  const notify = async () => {
    try {
      await api.post(`/api/orders/${order.id}/notify`, {});
      showToast('Уведомление поставлено в очередь', 'success');
    } catch {}
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
          load();
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
          navigate('/orders');
        } catch {}
      },
    });
  };

  const uploadDesign = async () => {
    const file = designRef.current?.files?.[0];
    if (!file) {
      designRef.current?.click();
      return;
    }

    setDesignBusy(true);
    try {
      await api.upload(`/api/orders/${order.id}/design`, file);
      showToast('Макет загружен', 'success');
      setSelectedDesignName('');
      if (designRef.current) designRef.current.value = '';
      load();
    } catch {
      // Toast comes from api layer.
    } finally {
      setDesignBusy(false);
    }
  };

  const handleDesignChange = (event) => {
    const file = event.target.files?.[0];
    setSelectedDesignName(file?.name || '');
  };

  const openDesignFile = () => {
    if (designUrl) window.open(designUrl, '_blank', 'noopener,noreferrer');
  };

  const summaryUploadAction = canUploadDesign
    ? (
      <button
        type="button"
        className="order-detail-summary-secondary"
        onClick={uploadDesign}
        disabled={designBusy}
      >
        <span className="order-detail-action-icon" aria-hidden="true">{SVG.design}</span>
        <span>{designBusy ? 'Загрузка...' : 'Загрузить макет'}</span>
      </button>
      )
    : designUrl
      ? (
        <button type="button" className="order-detail-summary-secondary" onClick={openDesignFile}>
          <span className="order-detail-action-icon" aria-hidden="true">{SVG.external}</span>
          <span>Открыть макет</span>
        </button>
        )
      : null;

  return (
    <div className="order-detail-page">
      <header className="order-detail-header">
        <button type="button" className="order-detail-back-btn" onClick={() => navigate('/orders')}>
          <span className="order-detail-back-icon" aria-hidden="true">{SVG.back}</span>
          <span>Назад</span>
        </button>
        <h1 className="order-detail-title">{order.order_number}</h1>
        <div className="order-detail-header-spacer" aria-hidden="true" />
      </header>

      <div className="order-detail-shell">
        <div className="order-detail-layout">
          <main className="order-detail-main">
            <section className="order-detail-card">
              <SectionHeading icon={SVG.client} title="Клиент" />
              <div className="order-detail-client-card">
                <div className="order-detail-client-copy">
                  <strong>{order.client_name}</strong>
                  {order.client_phone ? (
                    <a href={`tel:${order.client_phone}`} className="order-detail-client-phone">
                      <span className="order-detail-inline-icon" aria-hidden="true">{SVG.phone}</span>
                      <span>{order.client_phone}</span>
                    </a>
                  ) : (
                    <span className="order-detail-client-phone order-detail-client-phone-empty">Телефон не указан</span>
                  )}
                </div>
                <span className="order-detail-type-badge">{clientType}</span>
              </div>
            </section>

            <section className="order-detail-card">
              <SectionHeading icon={SVG.photo} title="Фото заказа" />
              {photoUrl && !photoBroken ? (
                <img
                  src={photoUrl}
                  alt="Фото заказа"
                  className="order-detail-photo is-clickable"
                  loading="lazy"
                  onError={() => setPhotoBroken(true)}
                  onClick={(event) => openImageViewer(event.currentTarget.currentSrc || event.currentTarget.src, 'Фото заказа')}
                />
              ) : (
                <div className="order-detail-photo-empty">
                  <span className="order-detail-photo-empty-icon" aria-hidden="true">{SVG.imagePlaceholder}</span>
                  <div>
                    <strong>Фото не загружено</strong>
                    <p>У заказа пока нет изображения.</p>
                  </div>
                </div>
              )}
            </section>

            <section className="order-detail-card">
              <SectionHeading icon={SVG.services} title="Услуги" />
              <div className="order-detail-items-wrap">
                <table className="order-detail-items-table">
                  <thead>
                    <tr>
                      <th>Услуга</th>
                      <th>Ширина</th>
                      <th>Высота</th>
                      <th>Кол-во</th>
                      <th>Цена</th>
                      <th>Итог</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const area = isAreaUnit(item.unit);
                      return (
                        <tr key={`${item.service_id || 'item'}_${index}`}>
                          <td>{item.name_ru || '—'}</td>
                          <td>{area ? (item.width || '—') : '—'}</td>
                          <td>{area ? (item.height || '—') : '—'}</td>
                          <td>{`${item.quantity || '—'} ${item.unit || ''}`.trim() || '—'}</td>
                          <td>{formatCurrency(item.unit_price, lang)}</td>
                          <td>{formatCurrency(item.total, lang)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="order-detail-total-row">
                <span>Итого по заказу</span>
                <strong>{formatCurrency(order.total_price, lang)}</strong>
              </div>

              {user.role === 'director' && (
                <div className="order-detail-finance-grid">
                  <div className="order-detail-finance-card order-detail-finance-card-cost">
                    <span className="order-detail-finance-label">Себестоимость</span>
                    <strong>{formatCurrency(order.material_cost, lang)}</strong>
                  </div>
                  <div className="order-detail-finance-card order-detail-finance-card-profit">
                    <span className="order-detail-finance-label">Прибыль</span>
                    <strong>{formatCurrency(order.total_price - (order.material_cost || 0), lang)}</strong>
                  </div>
                </div>
              )}
            </section>

            <section className="order-detail-card" id="order-detail-design">
              <SectionHeading
                icon={SVG.design}
                title="Макет"
                action={
                  canUploadDesign ? (
                    <button
                      type="button"
                      className="order-detail-upload-btn"
                      onClick={uploadDesign}
                      disabled={designBusy}
                    >
                      <span className="order-detail-action-icon" aria-hidden="true">{SVG.design}</span>
                      <span>{designBusy ? 'Загрузка...' : 'Загрузить макет'}</span>
                    </button>
                  ) : null
                }
              />

              <div className="order-detail-design-state">
                {order.design_file ? (
                  <a href={designUrl} target="_blank" rel="noopener noreferrer" className="order-detail-design-link">
                    Макет загружен
                  </a>
                ) : (
                  <span className="order-detail-design-muted">Макет не загружен</span>
                )}
              </div>

              <label className={`order-detail-upload-dropzone${canUploadDesign ? '' : ' order-detail-upload-dropzone-disabled'}`}>
                <input
                  ref={designRef}
                  type="file"
                  className="order-detail-file-input"
                  accept=".pdf,.cdr,.ai,.jpg,.jpeg,.png"
                  onChange={handleDesignChange}
                  disabled={!canUploadDesign}
                />
                <span className="order-detail-upload-dropzone-icon" aria-hidden="true">{SVG.design}</span>
                <span className="order-detail-upload-dropzone-title">
                  {selectedDesignName || 'Перетащите файл сюда или нажмите для выбора'}
                </span>
                <span className="order-detail-upload-dropzone-note">PDF, CDR, AI, JPG, PNG</span>
              </label>
            </section>

            <section className="order-detail-card">
              <SectionHeading icon={SVG.info} title="Информация" />
              <div className="order-detail-info-list">
                <div className="order-detail-info-row">
                  <span>Срок</span>
                  <strong className={overdue ? 'order-detail-overdue' : ''}>
                    {order.deadline ? formatDate(order.deadline, lang) : 'Не указан'}
                  </strong>
                </div>
                <div className="order-detail-info-row">
                  <span>Создан</span>
                  <strong>{formatDateTime(order.created_at, lang)}</strong>
                </div>
                {notes ? (
                  <div className="order-detail-note-box">{notes}</div>
                ) : null}
              </div>
            </section>

            <section className="order-detail-card">
              <SectionHeading icon={SVG.history} title="История" />
              <div className="order-detail-history-list">
                {history.length ? history.map((entry, index) => (
                  <div key={`${entry.created_at || 'history'}_${index}`} className="order-detail-history-item">
                    <span className="order-detail-history-dot" aria-hidden="true" />
                    <div className="order-detail-history-copy">
                      <strong>{entry.note || `${statusLabel(entry.old_status || '', lang)} → ${statusLabel(entry.new_status, lang)}`}</strong>
                      <span>{entry.full_name} • {formatDateTime(entry.created_at, lang)}</span>
                    </div>
                  </div>
                )) : (
                  <div className="order-detail-history-empty">История изменений пока пуста</div>
                )}
              </div>
            </section>

            {(canMarkDefect || canCancel) && (
              <div className="order-detail-bottom-actions">
                {canMarkDefect ? (
                  <button type="button" className="order-detail-bottom-btn order-detail-bottom-btn-warning" onClick={markDefect}>
                    Отметить как Брак
                  </button>
                ) : null}
                {canCancel ? (
                  <button type="button" className="order-detail-bottom-btn order-detail-bottom-btn-danger" onClick={cancelOrder}>
                    Отменить заказ
                  </button>
                ) : null}
              </div>
            )}
          </main>

          <aside className="order-detail-summary">
            <section className="order-detail-summary-card">
              <div className="order-detail-summary-head">
                <div className="order-detail-summary-title-wrap">
                  <span className="order-detail-summary-icon" aria-hidden="true">{SVG.summary}</span>
                  <div>
                    <h2 className="order-detail-summary-title">Сводка заказа</h2>
                    <div className="order-detail-summary-subtitle">{order.order_number}</div>
                  </div>
                </div>
                <span className={detailStatusClass(order.status)}>{statusLabel(order.status, lang)}</span>
              </div>

              <div className="order-detail-summary-client">
                <div className="order-detail-summary-client-row">
                  <span className="order-detail-summary-client-icon" aria-hidden="true">{SVG.client}</span>
                  <div className="order-detail-summary-client-copy">
                    <span>Клиент</span>
                    <strong>{order.client_name}</strong>
                  </div>
                </div>
                <div className="order-detail-summary-client-row">
                  <span className="order-detail-summary-client-icon" aria-hidden="true">{SVG.phone}</span>
                  <div className="order-detail-summary-client-copy">
                    <span>Телефон</span>
                    <strong>{order.client_phone || 'Не указан'}</strong>
                  </div>
                </div>
                <div className="order-detail-summary-client-row">
                  <span className="order-detail-summary-client-icon" aria-hidden="true">{SVG.shield}</span>
                  <div className="order-detail-summary-client-copy">
                    <span>Тип заказа</span>
                    <strong>{clientType}</strong>
                  </div>
                </div>
              </div>

              <div className="order-detail-summary-total">
                <span>Итого по заказу</span>
                <strong>{formatCurrency(order.total_price, lang)}</strong>
              </div>

              <div className="order-detail-summary-list">
                {showPrepayment ? (
                  <>
                    <div className="order-detail-summary-row">
                      <span>Предоплата</span>
                      <strong>{formatCurrency(prepaymentAmount, lang)}</strong>
                    </div>
                    <div className="order-detail-summary-row">
                      <span>Остаток</span>
                      <strong>{formatCurrency(remainingAmount, lang)}</strong>
                    </div>
                  </>
                ) : null}
                <div className="order-detail-summary-row">
                  <span className="order-detail-summary-row-label">
                    <span className="order-detail-inline-icon" aria-hidden="true">{SVG.calendar}</span>
                    <span>Срок</span>
                  </span>
                  <strong>{order.deadline ? formatDate(order.deadline, lang) : 'Не указан'}</strong>
                </div>
                <div className="order-detail-summary-row">
                  <span className="order-detail-summary-row-label">
                    <span className="order-detail-inline-icon" aria-hidden="true">{SVG.clock}</span>
                    <span>Создан</span>
                  </span>
                  <strong>{formatDateTime(order.created_at, lang)}</strong>
                </div>
              </div>

              <div className="order-detail-summary-actions">
                {canAdvance ? (
                  <button type="button" className="order-detail-summary-primary" onClick={advance}>
                    <span>{next.label}</span>
                    <span className="order-detail-action-icon" aria-hidden="true">{SVG.arrowRight}</span>
                  </button>
                ) : null}

                {canNotify ? (
                  <button type="button" className="order-detail-summary-secondary" onClick={notify}>
                    <span className="order-detail-action-icon" aria-hidden="true">{SVG.phone}</span>
                    <span>Отправить уведомление</span>
                  </button>
                ) : null}

              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
