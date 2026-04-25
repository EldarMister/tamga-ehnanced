import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatCurrency, formatDate, statusBadgeClass, statusLabel, isOverdue, buildUploadUrl, openImageViewer } from '../lib/utils.js';

const STATUS_FILTERS = [
  { value: '', label: 'Все' },
  { value: 'created', label: 'Новые' },
  { value: 'design', label: 'Дизайн' },
  { value: 'production', label: 'Производство' },
  { value: 'ready', label: 'Готовые' },
  { value: 'closed', label: 'Закрытые' },
  { value: 'defect', label: 'Брак' },
];

export default function Orders() {
  const { user, lang } = useAuth();
  const navigate = useNavigate();
  const canCreate = ['director', 'manager'].includes(user.role);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
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
    } catch { setError(true); }
  }, [filter, search]);

  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(load, 400);
    return () => clearTimeout(debRef.current);
  }, [load]);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Заказы</h1>
        {canCreate && <button className="btn btn-primary" onClick={() => navigate('/orders/new')}>+ Новый</button>}
      </div>
      <div className="px-4 mb-3">
        <input type="search" className="input" placeholder="Поиск по номеру или клиенту..."
               value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="px-4 mb-4 flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map(f => (
          <button key={f.value} className={`btn btn-sm ${f.value === filter ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFilter(f.value)}>{f.label}</button>
        ))}
      </div>
      <div className="px-4 space-y-3">
        {error ? (
          <div className="text-center text-red-500 py-8">Ошибка загрузки</div>
        ) : orders === null ? (
          <div className="flex justify-center py-8"><div className="spinner"></div></div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
            <p className="text-lg font-medium">Заказов нет</p>
            <p className="text-sm mt-1">Создайте первый заказ</p>
          </div>
        ) : orders.map(order => <OrderCard key={order.id} order={order} lang={lang} onOpen={() => navigate(`/orders/${order.id}`)} />)}
      </div>
    </>
  );
}

function OrderCard({ order, lang, onOpen }) {
  const [imgError, setImgError] = useState(false);
  const overdue = isOverdue(order);
  const itemsCount = order.items?.length || 0;
  const mainItem = order.items?.[0];
  const summary = itemsCount > 1
    ? `${itemsCount} услуг`
    : (mainItem ? `${mainItem.name_ru} • ${mainItem.quantity} ${mainItem.unit || ''}` : '—');
  const photoUrl = order.photo_url || buildUploadUrl(order.photo_file);

  return (
    <div className={`card cursor-pointer hover:shadow-md transition-shadow order-card ${overdue ? 'border-red-400 border-2' : ''}`} onClick={onOpen}>
      <div className="order-card-grid">
        {photoUrl && !imgError ? (
          <img src={photoUrl} alt="Фото заказа" className="order-thumb is-clickable" loading="lazy"
               onError={() => setImgError(true)}
               onClick={(e) => { e.stopPropagation(); openImageViewer(photoUrl, 'Фото заказа'); }} />
        ) : (
          <div className="order-thumb-placeholder">📷</div>
        )}
        <div>
          <div className="flex items-start justify-between mb-2">
            <div>
              <span className="font-bold text-blue-800">{order.order_number}</span>
              {overdue && <span className="badge badge-overdue ml-2">Просрочен</span>}
            </div>
            <span className={statusBadgeClass(order.status)}>{statusLabel(order.status, lang)}</span>
          </div>
          <div className="text-gray-900 font-medium">{order.client_name}</div>
          <div className="text-sm text-gray-500 mt-1">{summary}</div>
          <div className="flex items-center justify-between mt-3 text-sm">
            <span className="font-bold text-lg">{formatCurrency(order.total_price, lang)}</span>
            <span className="text-gray-400">{order.deadline ? formatDate(order.deadline, lang) : formatDate(order.created_at, lang)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
