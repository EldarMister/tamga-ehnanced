import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatCurrency } from '../lib/utils.js';

function isAreaUnit(unit) {
  if (!unit) return false;
  const u = unit.toLowerCase().replace(/\s+/g, '');
  return u.includes('м2') || u.includes('м²') || u.includes('m2') || u.includes('m²');
}

function calcLine(item, svc, clientType) {
  if (!svc) return { unitPrice: 0, lineTotal: 0, areaRequired: false };
  const unitPrice = (clientType === 'dealer' && svc.price_dealer > 0) ? svc.price_dealer : svc.price_retail;
  const qty = parseFloat(item.quantity) || 0;
  const areaRequired = isAreaUnit(svc.unit);
  if (areaRequired) {
    const w = parseFloat(item.width) || 0;
    const h = parseFloat(item.height) || 0;
    return { unitPrice, lineTotal: w * h * qty * unitPrice, areaRequired };
  }
  return { unitPrice, lineTotal: qty * unitPrice, areaRequired };
}

function newItem(serviceId = '') {
  return { id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, service_id: serviceId, width: '', height: '', quantity: '1' };
}

export default function OrderCreate() {
  const navigate = useNavigate();
  const { lang } = useAuth();
  const showToast = useToast();
  const [services, setServices] = useState([]);
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [clientType, setClientType] = useState('retail');
  const [busy, setBusy] = useState(false);
  const formRef = useRef();
  const photoRef = useRef();

  useEffect(() => {
    (async () => {
      try {
        const [svc, us] = await Promise.all([
          api.get('/api/pricelist'),
          api.get('/api/users').catch(() => []),
        ]);
        setServices(svc || []);
        setUsers(us || []);

        const prefillRaw = sessionStorage.getItem('calc_prefill');
        if (prefillRaw) {
          sessionStorage.removeItem('calc_prefill');
          try {
            const pf = JSON.parse(prefillRaw);
            setItems([{ id: `calc_${Date.now()}`, service_id: pf.service_id || '', width: pf.width || '', height: pf.height || '', quantity: pf.quantity || '1' }]);
            if (pf.client_type) setClientType(pf.client_type);
            return;
          } catch {}
        }
        setItems([newItem(svc?.[0]?.id || '')]);
      } catch {
        setServices([]); setUsers([]);
        setItems([newItem('')]);
      }
    })();
  }, []);

  const getService = (id) => services.find(s => s.id === parseInt(id));

  const total = useMemo(() => {
    return items.reduce((sum, item) => sum + calcLine(item, getService(item.service_id), clientType).lineTotal, 0);
  }, [items, clientType, services]);

  const updateItem = (id, patch) => setItems(arr => arr.map(i => i.id === id ? { ...i, ...patch } : i));
  const removeItem = (id) => setItems(arr => {
    const next = arr.filter(i => i.id !== id);
    return next.length === 0 ? [newItem(services[0]?.id || '')] : next;
  });
  const addItem = () => setItems(arr => [...arr, newItem('')]);

  const designers = users.filter(u => u.role === 'designer');
  const masters = users.filter(u => u.role === 'master');
  const assistants = users.filter(u => u.role === 'assistant');

  const submit = async (e) => {
    e.preventDefault();
    const form = e.target;
    setBusy(true);
    try {
      const payloadItems = [];
      for (const item of items) {
        if (!item.service_id) continue;
        const svc = getService(item.service_id);
        if (!svc) continue;
        const qty = parseFloat(item.quantity);
        if (!qty || qty <= 0) throw new Error('Проверьте количество');
        const areaRequired = isAreaUnit(svc.unit);
        const width = areaRequired ? parseFloat(item.width) : null;
        const height = areaRequired ? parseFloat(item.height) : null;
        if (areaRequired && (!width || !height)) throw new Error('Нужны ширина и высота для услуг в м²');
        payloadItems.push({ service_id: parseInt(item.service_id), quantity: qty, width: width || null, height: height || null, options: {} });
      }
      if (payloadItems.length === 0) throw new Error('Добавьте хотя бы одну услугу');

      const order = {
        client_name: form.client_name.value.trim(),
        client_phone: form.client_phone.value.trim(),
        client_type: clientType,
        items: payloadItems,
        notes: form.notes.value.trim(),
        deadline: form.deadline.value || null,
        assigned_designer: form.assigned_designer.value ? parseInt(form.assigned_designer.value) : null,
        assigned_master: form.assigned_master.value ? parseInt(form.assigned_master.value) : null,
        assigned_assistant: form.assigned_assistant.value ? parseInt(form.assigned_assistant.value) : null,
      };

      const result = await api.post('/api/orders', order);
      if (result) {
        let warning = '';
        const file = photoRef.current?.files?.[0];
        if (file) {
          try {
            const uploaded = await api.upload(`/api/orders/${result.id}/photo`, file);
            if (uploaded && uploaded.stored_in_fs === false) warning = ' Фото сохранено в резерв, но недоступно в файловой папке.';
          } catch (uploadErr) {
            warning = ` Фото не загрузилось: ${uploadErr?.message || 'ошибка сервера'}.`;
          }
        }
        showToast(`Заказ ${result.order_number} создан!${warning}`, warning ? 'warning' : 'success');
        navigate(`/orders/${result.id}`);
      }
    } catch (err) {
      if (err.message) showToast(err.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-header">
        <button className="btn btn-sm btn-secondary" onClick={() => navigate('/orders')}>← Назад</button>
        <h1 className="page-title">Новый заказ</h1>
        <div></div>
      </div>
      <div className="px-4 pb-8">
        <form ref={formRef} onSubmit={submit} className="space-y-4">
          <div className="card">
            <h3 className="font-bold mb-3 text-gray-700">Клиент</h3>
            <div className="space-y-3">
              <div>
                <label className="input-label">Имя клиента</label>
                <input type="text" className="input" name="client_name" required placeholder="ФИО или название компании" />
              </div>
              <div>
                <label className="input-label">Телефон</label>
                <input type="tel" className="input" name="client_phone" placeholder="+996..." />
              </div>
              <div>
                <label className="input-label">Тип</label>
                <select className="input" name="client_type" value={clientType} onChange={e => setClientType(e.target.value)}>
                  <option value="retail">Розница</option>
                  <option value="dealer">Дилер</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-700">Услуги в заказе</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>+ Добавить</button>
            </div>
            <div className="order-items-wrap">
              <table className="order-items-table">
                <thead>
                  <tr><th>Услуга</th><th>Ширина</th><th>Высота</th><th>Кол-во</th><th>Цена</th><th>Итог</th><th></th></tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const svc = getService(item.service_id);
                    const line = calcLine(item, svc, clientType);
                    return (
                      <tr key={item.id}>
                        <td>
                          <select className="input" value={item.service_id} onChange={e => updateItem(item.id, { service_id: e.target.value })}>
                            <option value="">Выберите услугу</option>
                            {services.map(s => (
                              <option key={s.id} value={s.id}>{s.name_ru} ({s.price_retail} сом/{s.unit})</option>
                            ))}
                          </select>
                        </td>
                        <td><input type="number" className="input" step="0.01" min="0" disabled={!line.areaRequired}
                                   value={item.width} onChange={e => updateItem(item.id, { width: e.target.value })} placeholder="м" /></td>
                        <td><input type="number" className="input" step="0.01" min="0" disabled={!line.areaRequired}
                                   value={item.height} onChange={e => updateItem(item.id, { height: e.target.value })} placeholder="м" /></td>
                        <td><input type="number" className="input" step="0.1" min="0.1"
                                   value={item.quantity} onChange={e => updateItem(item.id, { quantity: e.target.value })} /></td>
                        <td><div className="input bg-gray-50">{formatCurrency(line.unitPrice, lang)}</div></td>
                        <td><div className="input bg-blue-50 font-bold text-blue-800">{formatCurrency(line.lineTotal, lang)}</div></td>
                        <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem(item.id)}>✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-gray-500">Итого по заказу</span>
              <span className="font-bold text-lg">{formatCurrency(total, lang)}</span>
            </div>
          </div>

          <div className="card">
            <h3 className="font-bold mb-3 text-gray-700">Назначение</h3>
            <div className="space-y-3">
              <div>
                <label className="input-label">Дизайнер</label>
                <select className="input" name="assigned_designer">
                  <option value="">Не назначен</option>
                  {designers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Мастер</label>
                <select className="input" name="assigned_master">
                  <option value="">Не назначен</option>
                  {masters.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Помощник</label>
                <select className="input" name="assigned_assistant">
                  <option value="">Не назначен</option>
                  {assistants.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="font-bold mb-3 text-gray-700">Дополнительно</h3>
            <div className="space-y-3">
              <div>
                <label className="input-label">Срок сдачи</label>
                <input type="date" className="input" name="deadline" />
              </div>
              <div>
                <label className="input-label">Фото заказа</label>
                <input ref={photoRef} type="file" className="input" accept="image/*" />
              </div>
              <div>
                <label className="input-label">Примечание</label>
                <textarea className="input" name="notes" rows={2} placeholder="Комментарий к заказу..." />
              </div>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? 'Создание...' : 'Создать заказ'}
          </button>
        </form>
      </div>
    </>
  );
}
