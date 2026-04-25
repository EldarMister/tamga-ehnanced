import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatCurrency, statusLabel, roleLabel } from '../lib/utils.js';

export default function Reports() {
  const { lang } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [data, setData] = useState({ ordersSummary: null, materialUsage: [], empStats: [] });

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const [ordersSummary, materialUsage, empStats] = await Promise.all([
        api.get(`/api/reports/orders-summary?date_from=${from}&date_to=${to}`),
        api.get(`/api/reports/material-usage?date_from=${from}&date_to=${to}`),
        api.get(`/api/reports/employee-stats?date_from=${from}&date_to=${to}`).catch(() => []),
      ]);
      setData({ ordersSummary, materialUsage: materialUsage || [], empStats: empStats || [] });
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const { ordersSummary, materialUsage, empStats } = data;
  const maxUsed = materialUsage.length > 0 ? Math.max(...materialUsage.map(m => m.used), 1) : 1;
  const hasData = ordersSummary || materialUsage.length > 0 || empStats.length > 0;

  return (
    <>
      <div className="page-header"><h1 className="page-title">Отчёты</h1><div></div></div>
      <div className="px-4 space-y-4 pb-8">
        <div className="card">
          <div className="reports-filter-grid mb-4">
            <div>
              <label className="input-label">С</label>
              <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="input-label">По</label>
              <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={load}>Загрузить</button>
          </div>
        </div>

        <div>
          {loading ? <div className="flex justify-center py-8"><div className="spinner"></div></div>
            : error ? <div className="text-center text-red-500 py-8">Ошибка загрузки отчётов</div>
            : !hasData ? <div className="text-center text-gray-400 py-8">Нет данных за период</div>
            : (
              <>
                {ordersSummary && (
                  <div className="card mb-4">
                    <h3 className="font-bold mb-3">Заказы</h3>
                    <div className="reports-kpi-grid mb-4">
                      <div className="report-kpi report-kpi-orders">
                        <div className="report-kpi-value">{ordersSummary.totals.total_orders}</div>
                        <div className="report-kpi-label">Заказов</div>
                      </div>
                      <div className="report-kpi report-kpi-revenue">
                        <div className="report-kpi-value">{formatCurrency(ordersSummary.totals.total_revenue, lang)}</div>
                        <div className="report-kpi-label">Выручка</div>
                      </div>
                      <div className="report-kpi report-kpi-profit">
                        <div className="report-kpi-value">{formatCurrency(ordersSummary.profit, lang)}</div>
                        <div className="report-kpi-label">Прибыль</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {ordersSummary.by_status.map(s => (
                        <div key={s.status} className="report-status-row">
                          <span className="text-gray-600">{statusLabel(s.status, lang)}</span>
                          <span><span className="font-medium">{s.count}</span> • {formatCurrency(s.revenue, lang)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {materialUsage.length > 0 && (
                  <div className="card mb-4">
                    <h3 className="font-bold mb-3">Расход материалов</h3>
                    <div className="space-y-3">
                      {materialUsage.map((m, i) => (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-1 gap-2">
                            <span className="truncate">{m.name_ru}</span>
                            <span className="font-bold">{m.used.toFixed(1)} {m.unit}</span>
                          </div>
                          <div className="stock-bar">
                            <div className="stock-bar-fill" style={{ width: `${(m.used / maxUsed * 100).toFixed(0)}%`, background: 'var(--accent)' }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {empStats.length > 0 && (
                  <div className="card mb-4">
                    <h3 className="font-bold mb-3">Сотрудники</h3>
                    <div className="reports-table-wrap reports-desktop-table">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="py-2">Имя</th>
                            <th className="py-2 text-center">Дней</th>
                            <th className="py-2 text-center">Задач</th>
                            <th className="py-2 text-center">Инцид.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empStats.map((e, i) => (
                            <tr key={i} className="border-b">
                              <td className="py-2">
                                <div className="font-medium">{e.full_name}</div>
                                <div className="text-xs text-gray-400">{roleLabel(e.role, lang)}</div>
                              </td>
                              <td className="py-2 text-center font-bold">{e.days_worked}</td>
                              <td className="py-2 text-center font-bold">{e.tasks_done}</td>
                              <td className={`py-2 text-center font-bold ${e.incidents > 0 ? 'text-red-600' : ''}`}>{e.incidents}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="reports-mobile-list">
                      {empStats.map((e, i) => (
                        <div key={i} className="report-emp-card">
                          <div>
                            <div className="font-medium">{e.full_name}</div>
                            <div className="text-xs text-gray-400">{roleLabel(e.role, lang)}</div>
                          </div>
                          <div className="report-emp-stats">
                            <span>Дней: <b>{e.days_worked}</b></span>
                            <span>Задач: <b>{e.tasks_done}</b></span>
                            <span>Инцид.: <b className={e.incidents > 0 ? 'text-red-600' : ''}>{e.incidents}</b></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
        </div>
      </div>
    </>
  );
}
