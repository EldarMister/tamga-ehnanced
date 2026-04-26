import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatCurrency } from '../lib/utils.js';

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
  services: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  ),
  assignment: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  extra: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
  ),
  summary: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V6" />
      <path d="m8.5 9.5 3.5-3.5 3.5 3.5" />
      <path d="M5 16.5v.5A2 2 0 0 0 7 19h10a2 2 0 0 0 2-2v-.5" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="m7 7 1 12h8l1-12" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  ),
};

function isAreaUnit(unit) {
  if (!unit) return false;
  const u = unit.toLowerCase().replace(/\s+/g, '');
  return u.includes('м2') || u.includes('м²') || u.includes('m2') || u.includes('m²');
}

function getServiceUnitPrice(service, clientType) {
  if (!service) return 0;
  return clientType === 'dealer' && service.price_dealer > 0 ? service.price_dealer : service.price_retail;
}

function calcLine(item, service, clientType) {
  if (!service) return { unitPrice: 0, lineTotal: 0, areaRequired: false };
  const unitPrice = getServiceUnitPrice(service, clientType);
  const qty = parseFloat(item.quantity) || 0;
  const areaRequired = isAreaUnit(service.unit);

  if (areaRequired) {
    const width = parseFloat(item.width) || 0;
    const height = parseFloat(item.height) || 0;
    return { unitPrice, lineTotal: width * height * qty * unitPrice, areaRequired };
  }

  return { unitPrice, lineTotal: qty * unitPrice, areaRequired };
}

function newItem(serviceId = '') {
  return {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    service_id: serviceId,
    width: '',
    height: '',
    quantity: '1',
  };
}

function formatDeadline(value) {
  if (!value) return 'Не указан';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return 'Не указан';
  return `${day}.${month}.${year}`;
}

function SectionHeading({ icon, title }) {
  return (
    <div className="order-create-section-head">
      <span className="order-create-section-icon" aria-hidden="true">{icon}</span>
      <h2 className="order-create-section-title">{title}</h2>
    </div>
  );
}

export default function OrderCreate() {
  const navigate = useNavigate();
  const { lang } = useAuth();
  const showToast = useToast();

  const [services, setServices] = useState([]);
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [clientType, setClientType] = useState('retail');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedPhotoName, setSelectedPhotoName] = useState('');
  const [busy, setBusy] = useState(false);

  const photoRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [serviceList, userList] = await Promise.all([
          api.get('/api/pricelist'),
          api.get('/api/users').catch(() => []),
        ]);

        setServices(serviceList || []);
        setUsers(userList || []);

        const prefillRaw = sessionStorage.getItem('calc_prefill');
        if (prefillRaw) {
          sessionStorage.removeItem('calc_prefill');
          try {
            const prefill = JSON.parse(prefillRaw);
            setItems([{
              id: `calc_${Date.now()}`,
              service_id: prefill.service_id || '',
              width: prefill.width || '',
              height: prefill.height || '',
              quantity: prefill.quantity || '1',
            }]);
            if (prefill.client_type) setClientType(prefill.client_type);
            return;
          } catch {
            // Ignore broken prefill and fall back to the default first service.
          }
        }

        setItems([newItem(serviceList?.[0]?.id || '')]);
      } catch {
        setServices([]);
        setUsers([]);
        setItems([newItem('')]);
      }
    })();
  }, []);

  const getService = (id) => services.find((service) => service.id === parseInt(id, 10));

  const total = useMemo(() => {
    return items.reduce((sum, item) => sum + calcLine(item, getService(item.service_id), clientType).lineTotal, 0);
  }, [items, clientType, services]);

  const serviceCount = useMemo(() => {
    return items.filter((item) => !!getService(item.service_id)).length;
  }, [items, services]);

  const updateItem = (id, patch) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id) => {
    setItems((current) => {
      const next = current.filter((item) => item.id !== id);
      return next.length === 0 ? [newItem(services[0]?.id || '')] : next;
    });
  };

  const addItem = () => {
    setItems((current) => [...current, newItem('')]);
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    setSelectedPhotoName(file?.name || '');
  };

  const designers = users.filter((user) => user.role === 'designer');
  const masters = users.filter((user) => user.role === 'master');
  const assistants = users.filter((user) => user.role === 'assistant');

  const summaryClient = clientName.trim() || 'Не указан';
  const summaryDeadline = formatDeadline(deadline);
  const prepayment = formatCurrency(0, lang);
  const formattedTotal = formatCurrency(total, lang);

  const submit = async (event) => {
    event.preventDefault();
    const form = event.target;
    setBusy(true);

    try {
      const payloadItems = [];

      for (const item of items) {
        if (!item.service_id) continue;
        const service = getService(item.service_id);
        if (!service) continue;

        const qty = parseFloat(item.quantity);
        if (!qty || qty <= 0) throw new Error('Проверьте количество');

        const areaRequired = isAreaUnit(service.unit);
        const width = areaRequired ? parseFloat(item.width) : null;
        const height = areaRequired ? parseFloat(item.height) : null;

        if (areaRequired && (!width || !height)) {
          throw new Error('Нужны ширина и высота для услуг в м²');
        }

        payloadItems.push({
          service_id: parseInt(item.service_id, 10),
          quantity: qty,
          width: width || null,
          height: height || null,
          options: {},
        });
      }

      if (payloadItems.length === 0) throw new Error('Добавьте хотя бы одну услугу');

      const order = {
        client_name: form.client_name.value.trim(),
        client_phone: form.client_phone.value.trim(),
        client_type: clientType,
        items: payloadItems,
        notes: form.notes.value.trim(),
        deadline: form.deadline.value || null,
        assigned_designer: form.assigned_designer.value ? parseInt(form.assigned_designer.value, 10) : null,
        assigned_master: form.assigned_master.value ? parseInt(form.assigned_master.value, 10) : null,
        assigned_assistant: form.assigned_assistant.value ? parseInt(form.assigned_assistant.value, 10) : null,
      };

      const result = await api.post('/api/orders', order);

      if (result) {
        let warning = '';
        const file = photoRef.current?.files?.[0];

        if (file) {
          try {
            const uploaded = await api.upload(`/api/orders/${result.id}/photo`, file);
            if (uploaded && uploaded.stored_in_fs === false) {
              warning = ' Фото сохранено в резерв, но недоступно в файловой папке.';
            }
          } catch (uploadErr) {
            warning = ` Фото не загрузилось: ${uploadErr?.message || 'ошибка сервера'}.`;
          }
        }

        showToast(`Заказ ${result.order_number} создан!${warning}`, warning ? 'warning' : 'success');
        navigate(`/orders/${result.id}`);
      }
    } catch (err) {
      if (err.message) showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="order-create-page">
      <header className="order-create-header">
        <button type="button" className="order-create-back-btn" onClick={() => navigate('/orders')}>
          <span className="order-create-back-icon" aria-hidden="true">{SVG.back}</span>
          <span>Назад</span>
        </button>
        <h1 className="order-create-title">Новый заказ</h1>
        <div className="order-create-header-spacer" aria-hidden="true" />
      </header>

      <div className="order-create-shell">
        <form onSubmit={submit} className="order-create-form">
          <div className="order-create-layout">
            <div className="order-create-main">
              <section className="order-create-card">
                <SectionHeading icon={SVG.client} title="Клиент" />
                <div className="order-create-fields order-create-client-grid">
                  <label className="order-create-field order-create-field-span">
                    <span className="input-label">Имя клиента</span>
                    <input
                      type="text"
                      className="input"
                      name="client_name"
                      required
                      placeholder="ФИО или название компании"
                      value={clientName}
                      onChange={(event) => setClientName(event.target.value)}
                    />
                  </label>

                  <label className="order-create-field">
                    <span className="input-label">Телефон</span>
                    <input
                      type="tel"
                      className="input"
                      name="client_phone"
                      placeholder="+996..."
                      value={clientPhone}
                      onChange={(event) => setClientPhone(event.target.value)}
                    />
                  </label>

                  <label className="order-create-field">
                    <span className="input-label">Тип</span>
                    <select className="input" name="client_type" value={clientType} onChange={(event) => setClientType(event.target.value)}>
                      <option value="retail">Розница</option>
                      <option value="dealer">Дилер</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="order-create-card">
                <div className="order-create-section-head order-create-section-head-between">
                  <div className="order-create-section-title-wrap">
                    <span className="order-create-section-icon" aria-hidden="true">{SVG.services}</span>
                    <h2 className="order-create-section-title">Услуги в заказе</h2>
                  </div>

                  <button type="button" className="order-create-add-btn" onClick={addItem}>
                    <span className="order-create-add-icon" aria-hidden="true">{SVG.plus}</span>
                    <span>Добавить услугу</span>
                  </button>
                </div>

                <div className="order-create-service-head" aria-hidden="true">
                  <span>Услуга</span>
                  <span>Ширина</span>
                  <span>Высота</span>
                  <span>Кол-во</span>
                  <span>Цена</span>
                  <span>Итог</span>
                  <span />
                </div>

                <div className="order-create-service-list">
                  {items.map((item) => {
                    const service = getService(item.service_id);
                    const line = calcLine(item, service, clientType);

                    return (
                      <div key={item.id} className="order-create-service-row">
                        <label className="order-create-service-cell order-create-service-cell-service">
                          <span className="order-create-mobile-label">Услуга</span>
                          <select
                            className="input"
                            value={item.service_id}
                            onChange={(event) => updateItem(item.id, { service_id: event.target.value })}
                          >
                            <option value="">Выберите услугу</option>
                            {services.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.name_ru} ({formatCurrency(getServiceUnitPrice(entry, clientType), lang)}/{entry.unit})
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="order-create-service-cell order-create-service-cell-width">
                          <span className="order-create-mobile-label">Ширина</span>
                          <input
                            type="number"
                            className="input"
                            step="0.01"
                            min="0"
                            disabled={!line.areaRequired}
                            value={item.width}
                            onChange={(event) => updateItem(item.id, { width: event.target.value })}
                            placeholder="м"
                          />
                        </label>

                        <label className="order-create-service-cell order-create-service-cell-height">
                          <span className="order-create-mobile-label">Высота</span>
                          <input
                            type="number"
                            className="input"
                            step="0.01"
                            min="0"
                            disabled={!line.areaRequired}
                            value={item.height}
                            onChange={(event) => updateItem(item.id, { height: event.target.value })}
                            placeholder="м"
                          />
                        </label>

                        <label className="order-create-service-cell order-create-service-cell-qty">
                          <span className="order-create-mobile-label">Кол-во</span>
                          <input
                            type="number"
                            className="input"
                            step="0.1"
                            min="0.1"
                            value={item.quantity}
                            onChange={(event) => updateItem(item.id, { quantity: event.target.value })}
                          />
                        </label>

                        <div className="order-create-service-cell order-create-service-cell-price">
                          <span className="order-create-mobile-label">Цена</span>
                          <div className="order-create-valuebox">{formatCurrency(line.unitPrice, lang)}</div>
                        </div>

                        <div className="order-create-service-cell order-create-service-cell-total">
                          <span className="order-create-mobile-label">Итог</span>
                          <div className="order-create-valuebox order-create-valuebox-total">{formatCurrency(line.lineTotal, lang)}</div>
                        </div>

                        <button
                          type="button"
                          className="order-create-remove-btn"
                          onClick={() => removeItem(item.id)}
                          aria-label="Удалить услугу"
                          title="Удалить услугу"
                        >
                          {SVG.trash}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="order-create-total-row">
                  <span>Итого по заказу</span>
                  <strong>{formattedTotal}</strong>
                </div>
              </section>

              <section className="order-create-card">
                <SectionHeading icon={SVG.assignment} title="Назначение" />
                <div className="order-create-fields order-create-assignment-grid">
                  <label className="order-create-field">
                    <span className="input-label">Дизайнер</span>
                    <select className="input" name="assigned_designer" defaultValue="">
                      <option value="">Не назначен</option>
                      {designers.map((user) => (
                        <option key={user.id} value={user.id}>{user.full_name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="order-create-field">
                    <span className="input-label">Мастер</span>
                    <select className="input" name="assigned_master" defaultValue="">
                      <option value="">Не назначен</option>
                      {masters.map((user) => (
                        <option key={user.id} value={user.id}>{user.full_name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="order-create-field">
                    <span className="input-label">Помощник</span>
                    <select className="input" name="assigned_assistant" defaultValue="">
                      <option value="">Не назначен</option>
                      {assistants.map((user) => (
                        <option key={user.id} value={user.id}>{user.full_name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <section className="order-create-card">
                <SectionHeading icon={SVG.extra} title="Дополнительно" />
                <div className="order-create-fields">
                  <label className="order-create-field order-create-deadline-field">
                    <span className="input-label">Срок сдачи</span>
                    <input
                      type="date"
                      className="input"
                      name="deadline"
                      value={deadline}
                      onChange={(event) => setDeadline(event.target.value)}
                    />
                  </label>

                  <div className="order-create-field">
                    <span className="input-label">Фото заказа</span>
                    <label htmlFor="order-create-photo" className="order-create-upload">
                      <input
                        ref={photoRef}
                        id="order-create-photo"
                        type="file"
                        className="order-create-file-input"
                        accept="image/*"
                        onChange={handlePhotoChange}
                      />
                      <span className="order-create-upload-icon" aria-hidden="true">{SVG.upload}</span>
                      <span className="order-create-upload-title">
                        {selectedPhotoName || 'Перетащите файл сюда или нажмите для выбора'}
                      </span>
                      <span className="order-create-upload-note">
                        {selectedPhotoName ? 'Нажмите, чтобы выбрать другой файл' : 'PNG, JPG до 10 МБ'}
                      </span>
                    </label>
                  </div>

                  <label className="order-create-field">
                    <span className="input-label">Примечание</span>
                    <textarea
                      className="input order-create-textarea"
                      name="notes"
                      rows={3}
                      placeholder="Комментарий к заказу..."
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </label>
                </div>
              </section>
            </div>

            <aside className="order-create-summary">
              <div className="order-create-summary-card">
                <div className="order-create-summary-head">
                  <span className="order-create-summary-icon" aria-hidden="true">{SVG.summary}</span>
                  <h2 className="order-create-summary-title">Сводка заказа</h2>
                </div>

                <div className="order-create-summary-client-card">
                  <div className="order-create-summary-label">Клиент</div>
                  <div className="order-create-summary-client-row">
                    <div className="order-create-summary-client-copy">
                      <strong>{summaryClient}</strong>
                      {clientPhone.trim() ? <span>{clientPhone.trim()}</span> : null}
                    </div>
                    <span className="order-create-summary-client-icon" aria-hidden="true">{SVG.user}</span>
                  </div>
                </div>

                <div className="order-create-summary-metric">
                  <span className="order-create-summary-label">Услуг в заказе</span>
                  <strong>{serviceCount}</strong>
                </div>

                <div className="order-create-summary-total">
                  <span className="order-create-summary-label">Итого к оплате</span>
                  <strong>{formattedTotal}</strong>
                </div>

                <div className="order-create-summary-list">
                  <div className="order-create-summary-row">
                    <span>Предоплата</span>
                    <strong>{prepayment}</strong>
                  </div>
                  <div className="order-create-summary-row">
                    <span>Остаток</span>
                    <strong>{formattedTotal}</strong>
                  </div>
                  <div className="order-create-summary-row">
                    <span>Срок сдачи</span>
                    <strong>{summaryDeadline}</strong>
                  </div>
                  <div className="order-create-summary-row">
                    <span>Статус</span>
                    <span className="order-create-status-badge">Новый</span>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary order-create-submit-btn" disabled={busy}>
                  {busy ? 'Создание...' : 'Создать заказ'}
                </button>
              </div>
            </aside>
          </div>
        </form>
      </div>
    </div>
  );
}
