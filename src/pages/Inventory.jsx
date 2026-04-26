import { useEffect, useState, useCallback } from 'react';
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

export default function Inventory() {
  const { user, lang } = useAuth();
  const showToast = useToast();
  const { showForm, showCustom } = useModal();
  const [materials, setMaterials] = useState(null);
  const [error, setError] = useState(false);
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
  // Real-time: списания/резервы материалов из заказов и приход.
  useRealtime(['inventory:changed', 'orders:changed'], load);

  const showReceive = (id, name) => {
    showForm({
      title: `Приход: ${name}`,
      fields: [
        { name: 'quantity', label: 'Количество (м²)', type: 'number', required: true, step: '0.1', placeholder: '0' },
        { name: 'note', label: 'Примечание', type: 'text', placeholder: 'Поставщик, накладная...' },
      ],
      submitText: 'Принять',
      onSubmit: async (data) => {
        const qty = parseFloat(data.quantity);
        if (!qty || qty <= 0) { showToast('Введите количество', 'warning'); return; }
        try {
          await api.post(`/api/inventory/${id}/receive`, { quantity: qty, note: data.note });
          showToast('Материал принят', 'success');
          load();
        } catch {}
      },
    });
  };

  const showCorrection = (id, name) => {
    showForm({
      title: `Корректировка: ${name}`,
      fields: [
        { name: 'quantity', label: 'Количество (+/-)', type: 'number', required: true, step: '0.1', placeholder: 'напр. -5 или +10' },
        { name: 'note', label: 'Причина', type: 'text', required: true, placeholder: 'Инвентаризация, ошибка...' },
      ],
      submitText: 'Применить',
      onSubmit: async (data) => {
        const qty = parseFloat(data.quantity);
        if (!qty) { showToast('Введите количество', 'warning'); return; }
        try {
          await api.post(`/api/inventory/${id}/correction`, { quantity: qty, note: data.note });
          showToast('Корректировка применена', 'success');
          load();
        } catch {}
      },
    });
  };

  const showLedger = (id, name) => {
    showCustom((close) => <Ledger id={id} name={name} onClose={close} lang={lang} />);
  };

  return (
    <>
      <div className="page-header"><h1 className="page-title">Склад</h1><div></div></div>
      <div className="px-4 space-y-4 pb-8">
        {error ? <div className="text-center text-red-500 py-8">Ошибка загрузки</div>
          : materials === null ? <div className="flex justify-center py-8"><div className="spinner"></div></div>
          : materials.map(m => {
            const available = m.quantity - m.reserved;
            const maxStock = Math.max(m.quantity + 10, m.low_threshold * 5);
            const pct = Math.min(100, Math.max(0, (available / maxStock) * 100));
            const barColor = available < m.low_threshold ? 'bg-red-500'
              : available < m.low_threshold * 2 ? 'bg-yellow-500' : 'bg-green-500';
            return (
              <div key={m.id} className={`card ${m.is_low ? 'border-2 border-red-400' : ''}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold">{m.name_ru}</h3>
                    <span className="text-xs text-gray-400">{m.unit}</span>
                  </div>
                  {m.is_low && <span className="badge badge-cancelled">МАЛО!</span>}
                </div>
                <div className="stock-bar my-3">
                  <div className={`stock-bar-fill ${barColor}`} style={{ width: `${pct}%` }}></div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div><div className="text-gray-400">На складе</div><div className="font-bold text-lg">{m.quantity.toFixed(1)}</div></div>
                  <div><div className="text-gray-400">Резерв</div><div className="font-bold text-lg text-yellow-600">{m.reserved.toFixed(1)}</div></div>
                  <div><div className="text-gray-400">Доступно</div><div className={`font-bold text-lg ${m.is_low ? 'text-red-600' : 'text-green-600'}`}>{available.toFixed(1)}</div></div>
                </div>
                {canManage && (
                  <div className="flex gap-2 mt-4">
                    <button className="btn btn-success btn-sm flex-1" onClick={() => showReceive(m.id, m.name_ru)}>+ Приход</button>
                    <button className="btn btn-secondary btn-sm flex-1" onClick={() => showCorrection(m.id, m.name_ru)}>± Коррекция</button>
                    <button className="btn btn-outline btn-sm" onClick={() => showLedger(m.id, m.name_ru)}>📋</button>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </>
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
