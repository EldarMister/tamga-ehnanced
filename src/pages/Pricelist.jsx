import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatCurrency } from '../lib/utils.js';

export default function Pricelist() {
  const { user, lang } = useAuth();
  const showToast = useToast();
  const isDirector = user.role === 'director';
  const [services, setServices] = useState(null);
  const [edits, setEdits] = useState({});
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get('/api/pricelist').then(s => setServices(s || [])).catch(() => setError(true));
  }, []);

  const updateEdit = (id, field, value) => {
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  };

  const save = async (s) => {
    const e = edits[s.id] || {};
    const data = {
      price_retail: parseFloat(e.retail ?? s.price_retail) || 0,
      price_dealer: parseFloat(e.dealer ?? s.price_dealer) || 0,
      cost_price: parseFloat(e.cost ?? s.cost_price) || 0,
    };
    try {
      await api.put(`/api/pricelist/${s.id}`, data);
      showToast('Цена обновлена', 'success');
    } catch {}
  };

  const inputStyle = { width: 80, minHeight: 36, padding: '4px 8px' };

  return (
    <>
      <div className="page-header"><h1 className="page-title">Прайс-лист</h1><div></div></div>
      <div className="px-4 pb-8">
        {error ? <div className="text-center text-red-500 py-8">Ошибка загрузки</div>
          : services === null ? <div className="flex justify-center py-8"><div className="spinner"></div></div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b-2">
                    <th className="py-2 pr-2">Услуга</th>
                    <th className="py-2 pr-2">Ед.</th>
                    <th className="py-2 pr-2">Розница</th>
                    <th className="py-2 pr-2">Дилер</th>
                    {isDirector && <><th className="py-2 pr-2">Себест.</th><th className="py-2"></th></>}
                  </tr>
                </thead>
                <tbody>
                  {services.map(s => (
                    <tr key={s.id} className="border-b">
                      <td className="py-3 pr-2 font-medium">{s.name_ru}</td>
                      <td className="py-3 pr-2 text-gray-500">{s.unit}</td>
                      {isDirector ? (
                        <>
                          <td className="py-3 pr-2"><input type="number" className="input input-sm text-center" style={inputStyle}
                                                            defaultValue={s.price_retail}
                                                            onChange={e => updateEdit(s.id, 'retail', e.target.value)} /></td>
                          <td className="py-3 pr-2"><input type="number" className="input input-sm text-center" style={inputStyle}
                                                            defaultValue={s.price_dealer}
                                                            onChange={e => updateEdit(s.id, 'dealer', e.target.value)} /></td>
                          <td className="py-3 pr-2"><input type="number" className="input input-sm text-center" style={inputStyle}
                                                            defaultValue={s.cost_price}
                                                            onChange={e => updateEdit(s.id, 'cost', e.target.value)} /></td>
                          <td className="py-3"><button className="btn btn-primary btn-sm" onClick={() => save(s)}>💾</button></td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 pr-2 font-bold">{formatCurrency(s.price_retail, lang)}</td>
                          <td className="py-3 pr-2">{s.price_dealer > 0 ? formatCurrency(s.price_dealer, lang) : '—'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </>
  );
}
