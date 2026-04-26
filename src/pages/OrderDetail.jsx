import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useModal } from '../components/Modal.jsx';
import { formatCurrency, formatDate, formatDateTime, statusBadgeClass, statusLabel, isOverdue, buildUploadUrl, openImageViewer } from '../lib/utils.js';

const NEXT_STATUS = {
  created:     { label: 'Передать в дизайн',  status: 'design',     roles: ['manager', 'director'] },
  design:      { label: 'В производство',     status: 'production', roles: ['designer', 'manager', 'director'] },
  production:  { label: 'Готов к выдаче',     status: 'ready',      roles: ['master', 'manager', 'director'] },
  ready:       { label: 'Выдан клиенту',      status: 'closed',     roles: ['manager', 'director'] },
  design_done: { label: 'В производство',     status: 'production', roles: ['manager', 'director', 'master'] },
  printed:     { label: 'Готов к выдаче',     status: 'ready',      roles: ['manager', 'director'] },
  postprocess: { label: 'Готов к выдаче',     status: 'ready',      roles: ['assistant', 'manager', 'director'] },
};

function isAreaUnit(unit) {
  if (!unit) return false;
  const u = unit.toLowerCase().replace(/\s+/g, '');
  return u.includes('м2') || u.includes('м²') || u.includes('m2') || u.includes('m²');
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
  const designRef = useRef();

  const load = useCallback(async () => {
    setError(false);
    try {
      api.clearCache(`/api/orders/${id}`);
      const data = await api.get(`/api/orders/${id}`);
      setOrder(data);
      setPhotoBroken(false);
    } catch { setError(true); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="text-center text-red-500 py-16">Ошибка загрузки заказа</div>;
  if (!order) return <div className="flex justify-center py-16"><div className="spinner"></div></div>;

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
  const items = Array.isArray(order.items) ? order.items : [];
  const prepaymentAmount = Number(order.prepayment_amount || 0);
  const remainingAmount = Number.isFinite(Number(order.remaining_amount))
    ? Number(order.remaining_amount)
    : Math.max(Number(order.total_price || 0) - prepaymentAmount, 0);

  const advance = () => {
    showConfirm({
      title: 'Подтверждение',
      body: `Перевести заказ в статус "${next.label}"?`,
      onConfirm: async () => {
        try {
          await api.patch(`/api/orders/${order.id}/status`, { status: next.status });
          showToast('Статус обновлён', 'success'); load();
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
        { type: 'select', name: 'caused_by', label: 'Виновник',
          options: [{ value: 'manager', label: 'Менеджер' }, { value: 'designer', label: 'Дизайнер' }, { value: 'master', label: 'Печатник' }] },
        { type: 'textarea', name: 'description', label: 'Описание брака', placeholder: 'Опишите проблему...' },
      ],
      submitText: 'Отметить как Брак',
      onSubmit: async (data) => {
        try {
          const causeLabels = { manager: 'Менеджер', designer: 'Дизайнер', master: 'Печатник' };
          const note = `Виновник: ${causeLabels[data.caused_by] || data.caused_by}. ${data.description || ''}`.trim();
          await api.patch(`/api/orders/${order.id}/status`, { status: 'defect', note });
          showToast('Заказ отмечен как брак', 'warning'); load();
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
    if (!file) { showToast('Выберите файл', 'warning'); return; }
    try {
      await api.upload(`/api/orders/${order.id}/design`, file);
      showToast('Макет загружен', 'success');
      load();
    } catch {}
  };

  return (
    <>
      <div className="page-header">
        <button className="btn btn-sm btn-secondary" onClick={() => navigate('/orders')}>← Назад</button>
        <h1 className="text-lg font-bold">{order.order_number}</h1>
        <div></div>
      </div>
      <div className="px-4 space-y-4 pb-8">
        <div className="card">
          <div className="flex items-center justify-between">
            <span className={`${statusBadgeClass(order.status)} text-base px-4 py-2`}>{statusLabel(order.status, lang)}</span>
            {overdue && <span className="badge badge-overdue">Просрочен!</span>}
          </div>
          {canAdvance && <button className="btn btn-success btn-block btn-lg mt-4" onClick={advance}>{next.label} →</button>}
          {canNotify && <button className="btn btn-primary btn-block btn-lg mt-3" onClick={notify}>Отправить уведомление клиенту</button>}
        </div>

        <div className="card">
          <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Клиент</h3>
          <div className="font-bold text-lg">{order.client_name}</div>
          {order.client_phone && <a href={`tel:${order.client_phone}`} className="text-blue-600">{order.client_phone}</a>}
          <span className={`badge ${order.client_type === 'dealer' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'} ml-2`}>
            {order.client_type === 'dealer' ? 'Дилер' : 'Розница'}
          </span>
        </div>

        {photoUrl && !photoBroken && (
          <div className="card">
            <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Фото заказа</h3>
            <img src={photoUrl} alt="Фото заказа" className="order-photo is-clickable" loading="lazy"
                 onError={() => setPhotoBroken(true)}
                 onClick={(e) => openImageViewer(e.currentTarget.currentSrc || e.currentTarget.src, 'Фото заказа')} />
          </div>
        )}
        {photoUrl && photoBroken && (
          <div className="card"><div className="text-gray-400 text-sm">Фото недоступно</div></div>
        )}

        <div className="card">
          <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Услуги</h3>
          <div className="order-items-wrap">
            <table className="order-items-table">
              <thead><tr><th>Услуга</th><th>Ширина</th><th>Высота</th><th>Кол-во</th><th>Цена</th><th>Итог</th></tr></thead>
              <tbody>
                {items.map((i, idx) => {
                  const area = isAreaUnit(i.unit);
                  return (
                    <tr key={idx}>
                      <td>{i.name_ru || ''}</td>
                      <td>{area ? (i.width || '—') : '—'}</td>
                      <td>{area ? (i.height || '—') : '—'}</td>
                      <td>{i.quantity} {i.unit || ''}</td>
                      <td>{formatCurrency(i.unit_price, lang)}</td>
                      <td>{formatCurrency(i.total, lang)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-gray-500">Итого по заказу</span>
            <span className="font-bold text-lg">{formatCurrency(order.total_price, lang)}</span>
          </div>
          <div className="mt-3 pt-3 border-t">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-400">Предоплата</div>
                <div className="font-bold text-blue-600">{formatCurrency(prepaymentAmount, lang)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Остаток</div>
                <div className="font-bold">{formatCurrency(remainingAmount, lang)}</div>
              </div>
            </div>
          </div>
          {user.role === 'director' && (
            <div className="mt-3 pt-3 border-t">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-400">Себестоимость</div>
                  <div className="font-bold text-red-600">{formatCurrency(order.material_cost, lang)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Прибыль</div>
                  <div className="font-bold text-green-600">{formatCurrency(order.total_price - (order.material_cost || 0), lang)}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {(order.design_file || canUploadDesign) && (
          <div className="card">
            <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Макет</h3>
            {order.design_file ? (
              <a href={`/api/uploads/${order.design_file}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">📎 {order.design_file}</a>
            ) : (
              <p className="text-gray-400">Макет не загружен</p>
            )}
            {canUploadDesign && (
              <div className="mt-3">
                <input ref={designRef} type="file" className="input" accept=".pdf,.ai,.cdr,.psd,.jpg,.jpeg,.png,.tiff" />
                <button className="btn btn-primary btn-sm mt-2" onClick={uploadDesign}>Загрузить макет</button>
              </div>
            )}
          </div>
        )}

        <div className="card">
          <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Информация</h3>
          <div className="space-y-2 text-sm">
            {order.deadline && (
              <div className="flex justify-between">
                <span className="text-gray-500">Срок</span>
                <span className={`font-medium ${overdue ? 'text-red-600' : ''}`}>{formatDate(order.deadline, lang)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Создан</span>
              <span>{formatDateTime(order.created_at, lang)}</span>
            </div>
            {order.notes && <div className="mt-2 p-3 bg-gray-50 rounded-lg text-gray-600">{order.notes}</div>}
          </div>
        </div>

        <div className="card">
          <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">История</h3>
          <div className="space-y-3">
            {(order.history || []).map((h, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                <div>
                  <div className="font-medium">{h.note || `${statusLabel(h.old_status || '', lang)} → ${statusLabel(h.new_status, lang)}`}</div>
                  <div className="text-gray-400">{h.full_name} • {formatDateTime(h.created_at, lang)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {canMarkDefect && <button className="btn btn-warning btn-block" onClick={markDefect}>Отметить как Брак</button>}
        {canCancel && <button className="btn btn-danger btn-block mt-2" onClick={cancelOrder}>Отменить заказ</button>}
      </div>
    </>
  );
}
