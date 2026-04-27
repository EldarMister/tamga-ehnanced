import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatCurrency } from '../lib/utils.js';

const isAreaUnit = (unit) => {
  if (!unit) return false;
  const u = String(unit).toLowerCase().replace(/\s+/g, '');
  return u.includes('м2') || u.includes('м²') || u.includes('m2') || u.includes('m²');
};

const isSheetUnit = (unit) => {
  if (!unit) return false;
  const u = String(unit).toLowerCase();
  return u.includes('sheet') || u.includes('лист');
};

function parseOptions(raw) {
  if (!raw) return [];
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(obj)) {
      return obj.filter(o => o && o.key).map(o => ({ key: String(o.key), label: o.label || o.key, price: Number(o.price) || 0 }));
    }
    if (typeof obj === 'object') {
      return Object.entries(obj).filter(([, v]) => v !== null && v !== undefined).map(([key, val]) => ({
        key,
        label: typeof val === 'object' ? (val.label || key) : key,
        price: typeof val === 'object' ? (Number(val.price) || 0) : (Number(val) || 0),
      }));
    }
  } catch {}
  return [];
}

function parseOptionsObject(raw) {
  if (!raw) return {};
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
  } catch { return {}; }
}

function canonicalServiceType(svc) {
  const code = String(svc?.code || '').toLowerCase();
  const category = String(svc?.category || '').toLowerCase();
  const name = String(svc?.name_ru || '').toLowerCase();
  const source = `${code} ${category} ${name}`;
  const has = (...patterns) => patterns.some(p => source.includes(p));

  if (has('banner', 'баннер')) return 'banner';
  if (has('perfo', 'перфо')) return 'setka';
  if (has('samokley', 'samokle', 'vinyl', 'самоклей')) return 'samokleyka';
  if (has('setka', 'mesh', 'сетк')) return 'setka';
  if (has('stend', 'stand', 'forex', 'стенд')) return 'stend';
  if (has('plotter', 'плоттер', 'plot_cut', 'rezka', 'резка')) return 'plotter';
  if (has('letters', 'букв')) return 'letters';
  if (has('tablich', 'table', 'таблич')) return 'tablichka';
  if (has('menu', 'меню')) return 'menu';
  if (has('vizit', 'business_card', 'визит')) return 'vizitka';
  if (has('color_print', 'colorprint', 'цветн')) return 'colorprint';
  if (has('print', 'распечат', 'raspechat')) return 'print';
  if (has('dtf')) return 'dtf';
  return '';
}

const isTwoSideKey = (key) => /(two|2|double|двух|двуст|артын|артына|артынан)/.test(String(key || '').toLowerCase());

function isOptionAllowedForClient(rawOptions, key, clientType) {
  const meta = rawOptions?.[key];
  if (!meta || typeof meta !== 'object') return true;
  if (!Array.isArray(meta.client_types) || meta.client_types.length === 0) return true;
  return meta.client_types.includes(clientType);
}

function compute(svc, calc) {
  if (!svc) return { unitPrice: 0, quantity: 0, area: null, baseCost: 0, optionsCost: 0, total: 0, options: [], rings: false, hasMin: false, discount: false };

  const defaultUnitPrice = (calc.client_type === 'dealer' && svc.price_dealer > 0) ? svc.price_dealer : svc.price_retail;
  const options = parseOptions(svc.options);
  const rawOptions = parseOptionsObject(svc.options);
  const serviceType = canonicalServiceType(svc);
  const areaUnit = isAreaUnit(svc.unit);
  let unitPrice = defaultUnitPrice;
  let quantity = 0;
  let area = null;
  let baseCost = 0;
  let rings = false;
  let hasMin = false;
  let discount = false;

  if (areaUnit) {
    const w = Math.max(0, parseFloat(calc.width) || 0);
    const h = Math.max(0, parseFloat(calc.height) || 0);
    const copies = Math.max(1, parseInt(calc.copies) || 1);
    const areaRaw = w * h;
    area = Math.round(areaRaw * 100) / 100;
    quantity = Math.round(areaRaw * copies * 100) / 100;

    if (calc.client_type === 'dealer') {
      // ── ДИЛЕРСКИЕ ЦЕНЫ (новая формула из КАЛК.html)
      if (serviceType === 'banner') {
        // <1м² → фикс. 350 сом; иначе 300 без колец / 350 с кольцами
        rings = !!calc.options?.rings;
        const rate = rings ? 350 : 300;
        unitPrice = rate;
        if (areaRaw > 0 && areaRaw < 1) {
          hasMin = true;
          baseCost = 350 * copies;
        } else {
          baseCost = areaRaw * rate * copies;
        }
      }
      else if (serviceType === 'samokleyka') { unitPrice = 400; baseCost = areaRaw * 400 * copies; }
      else if (serviceType === 'setka') { unitPrice = 500; baseCost = areaRaw * 500 * copies; }
      else if (serviceType === 'stend') { unitPrice = 1800; baseCost = areaRaw * 1800 * copies; }
      else if (serviceType === 'plotter') { unitPrice = 1000; baseCost = areaRaw * 1000 * copies; }
      else { baseCost = quantity * unitPrice; }
    } else {
      // ── РОЗНИЧНЫЕ ЦЕНЫ (новая формула из КАЛК.html: скидка при >20м²)
      if (serviceType === 'banner') {
        discount = areaRaw > 20;
        const rate = discount ? 400 : 450;
        unitPrice = rate;
        baseCost = areaRaw * rate * copies;
      } else if (serviceType === 'samokleyka') {
        discount = areaRaw > 20;
        const rate = discount ? 500 : 600;
        unitPrice = rate;
        baseCost = areaRaw * rate * copies;
      } else if (serviceType === 'setka') {
        // Перфосамоклейка / сетка
        discount = areaRaw > 20;
        const rate = discount ? 600 : 700;
        unitPrice = rate;
        baseCost = areaRaw * rate * copies;
      } else if (serviceType === 'stend') {
        unitPrice = 1800; baseCost = areaRaw * 1800 * copies;
      } else if (serviceType === 'plotter') {
        unitPrice = 1000; baseCost = areaRaw * 1000 * copies;
      } else { baseCost = quantity * unitPrice; }
    }
  } else {
    quantity = Math.max(0, parseFloat(calc.quantity) || 0);
    if (serviceType === 'letters') {
      // Объёмные буквы: высота (см) × тариф (50 сом/см) × кол-во букв.
      // calc.quantity = высота буквы, calc.copies = кол-во букв.
      const height = Math.max(0, parseFloat(calc.quantity) || 0);
      const count = Math.max(1, parseInt(calc.copies) || 1);
      unitPrice = svc.price_retail || 50; // 50 сом за см высоты, как в референсе
      baseCost = height * unitPrice * count;
      quantity = height * count; // итоговое quantity для заказа: см × шт
    } else if (serviceType === 'dtf') {
      const twoSide = Object.entries(calc.options || {}).some(([k, v]) => v && isTwoSideKey(k));
      unitPrice = twoSide ? (quantity >= 10 ? 400 : 500) : 350;
      baseCost = unitPrice * quantity;
    } else if (serviceType === 'tablichka') { unitPrice = 350; baseCost = unitPrice * quantity; }
    else if (serviceType === 'menu') { unitPrice = 150; baseCost = unitPrice * quantity; }
    else if (serviceType === 'vizitka') {
      // Визитки: 1-стор. — 5 сом, 2-стор. — 6 сом
      const preset = rawOptions?.vizitka_prices || {};
      const onePrice = Number(preset.one) || 5;
      const twoPrice = Number(preset.two) || 6;
      const twoSide = Object.entries(calc.options || {}).some(([k, v]) => v && isTwoSideKey(k));
      unitPrice = twoSide ? twoPrice : onePrice;
      baseCost = unitPrice * quantity;
    } else if (serviceType === 'print') {
      // Распечатка: 1-стор. → 10 сом (≥100 листов → 5 сом), 2-стор. → 11 сом
      const twoSide = Object.entries(calc.options || {}).some(([k, v]) => v && isTwoSideKey(k));
      if (twoSide) {
        unitPrice = 11;
      } else {
        discount = quantity >= 100;
        unitPrice = discount ? 5 : 10;
      }
      baseCost = unitPrice * quantity;
    } else if (serviceType === 'colorprint') {
      // Цветная печать (300г): 50 сом/лист
      unitPrice = 50;
      baseCost = unitPrice * quantity;
    } else { baseCost = quantity * unitPrice; }
  }

  let optionsCost = 0;
  options.forEach(opt => {
    if (!calc.options[opt.key] || opt.price <= 0) return;
    if (!isOptionAllowedForClient(rawOptions, opt.key, calc.client_type)) return;
    if (serviceType === 'dtf' && isTwoSideKey(opt.key)) return;
    if (serviceType === 'vizitka' && (opt.key === 'vizitka_prices' || isTwoSideKey(opt.key))) return;
    if (serviceType === 'print' && isTwoSideKey(opt.key)) return;
    if (serviceType === 'banner' && calc.client_type === 'dealer' && opt.key === 'rings') return;
    optionsCost += opt.price * (quantity > 0 ? quantity : 0);
  });

  const total = Math.round(baseCost + optionsCost);
  return { unitPrice, quantity, area, baseCost, optionsCost, total, options, rings, hasMin, discount };
}

export default function Calculator() {
  const { lang } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();
  const [services, setServices] = useState(null);
  const [error, setError] = useState(false);
  const [calc, setCalc] = useState({
    service_id: '', client_type: 'retail',
    width: '', height: '', copies: '1', quantity: '1', options: {},
  });

  useEffect(() => {
    api.get('/api/pricelist').then(s => {
      const list = s || [];
      setServices(list);
      if (list.length > 0) setCalc(c => ({ ...c, service_id: c.service_id || String(list[0].id) }));
    }).catch(() => setError(true));
  }, []);

  const svc = useMemo(() => services?.find(s => String(s.id) === String(calc.service_id)), [services, calc.service_id]);
  const result = useMemo(() => compute(svc, calc), [svc, calc]);
  const area = isAreaUnit(svc?.unit);
  const sheet = isSheetUnit(svc?.unit);
  const stype = canonicalServiceType(svc);
  const isLetters = stype === 'letters';
  const isDealerBanner = stype === 'banner' && calc.client_type === 'dealer';
  const isPrint = stype === 'print';
  const isVizitka = stype === 'vizitka';

  const setService = (id) => setCalc({ service_id: id, client_type: calc.client_type, width: '', height: '', copies: '1', quantity: '1', options: {} });
  const setClient = (t) => setCalc(c => ({ ...c, client_type: t }));
  const setField = (k, v) => setCalc(c => ({ ...c, [k]: v }));
  const toggleOpt = (k, v) => setCalc(c => ({ ...c, options: { ...c.options, [k]: v } }));

  const toOrder = () => {
    if (!svc) { showToast('Выберите услугу', 'warning'); return; }
    if (result.total === 0) { showToast('Укажите параметры расчёта', 'warning'); return; }
    // Для letters передаём итоговую quantity = высота_см × кол-во_букв,
    // чтобы на бэке total = quantity × unit_price (50) совпал с расчётом.
    const orderQuantity = area
      ? (calc.copies || '1')
      : isLetters
        ? String(result.quantity || 0)
        : calc.quantity;
    const prefill = {
      service_id: String(calc.service_id),
      client_type: calc.client_type,
      width: calc.width || null,
      height: calc.height || null,
      quantity: orderQuantity,
      options: calc.options,
    };
    sessionStorage.setItem('calc_prefill', JSON.stringify(prefill));
    navigate('/orders/new');
  };

  if (error) {
    return (
      <>
        <div className="page-header"><h1 className="page-title">Калькулятор</h1></div>
        <div className="text-center text-red-500 py-16">Ошибка загрузки услуг</div>
      </>
    );
  }
  if (!services) {
    return (
      <>
        <div className="page-header"><h1 className="page-title">Калькулятор</h1></div>
        <div className="flex justify-center py-16"><div className="spinner"></div></div>
      </>
    );
  }

  const minQty = parseFloat(calc.quantity) || 0;
  const showMinWarn = sheet && svc?.min_order && minQty > 0 && minQty < svc.min_order;

  return (
    <>
      <div className="page-header"><h1 className="page-title">Калькулятор</h1></div>
      <div className="px-4 pb-8 space-y-4">
        <div className="card space-y-3">
          <div>
            <label className="input-label">Услуга</label>
            <select className="input" value={calc.service_id} onChange={e => setService(e.target.value)}>
              {services.map(s => <option key={s.id} value={s.id}>{s.name_ru} ({s.unit})</option>)}
            </select>
          </div>
          <div>
            <label className="input-label">Тип клиента</label>
            <div className="flex gap-2">
              <button className={`btn flex-1 btn-toggle ${calc.client_type === 'retail' ? 'is-active' : ''}`} onClick={() => setClient('retail')}>Розница</button>
              <button className={`btn flex-1 btn-toggle ${calc.client_type === 'dealer' ? 'is-active' : ''}`} onClick={() => setClient('dealer')}>Дилер</button>
            </div>
          </div>
        </div>

        <div className="card space-y-3">
          <h3 className="font-bold text-sm text-gray-400 uppercase">Параметры</h3>
          {area ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="input-label">Ширина (м)</label>
                  <input type="number" className="input" value={calc.width} placeholder="0.00" step="0.01" min="0" onChange={e => setField('width', e.target.value)} />
                </div>
                <div>
                  <label className="input-label">Высота (м)</label>
                  <input type="number" className="input" value={calc.height} placeholder="0.00" step="0.01" min="0" onChange={e => setField('height', e.target.value)} />
                </div>
                <div>
                  <label className="input-label">Кол-во (шт)</label>
                  <input type="number" className="input" value={calc.copies} placeholder="1" step="1" min="1" onChange={e => setField('copies', String(Math.max(1, parseInt(e.target.value) || 1)))} />
                </div>
              </div>
              <div className="text-sm text-gray-500">
                Площадь: <span className="font-medium">{result.area ?? 0} м²</span>
                &nbsp;×&nbsp;<span>{calc.copies || 1}</span> шт
                = <span className="font-medium">{result.quantity} м²</span>
              </div>

              {/* Люверсы — только для дилерского баннера */}
              {isDealerBanner && (
                <label className="flex items-center gap-3 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={!!calc.options?.rings}
                    onChange={e => toggleOpt('rings', e.target.checked)}
                  />
                  <span className="flex-1">С люверсами (кольцами)</span>
                  <span className="text-sm text-gray-500">350 сом/м²</span>
                </label>
              )}

              {/* Подсказки по тарифу */}
              {result.hasMin && (
                <div className="text-sm text-orange-600 font-medium">
                  ⚠ Площадь &lt; 1 м² — применяется минимальная цена 350 сом
                </div>
              )}
              {result.discount && (
                <div className="text-sm text-green-600 font-medium">
                  ★ Применена скидка за объём (&gt; 20 м²)
                </div>
              )}
            </>
          ) : isLetters ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="input-label">Высота буквы (см)</label>
                  <input type="number" className="input" value={calc.quantity} placeholder="40" step="1" min="0"
                         onChange={e => setField('quantity', e.target.value)} />
                </div>
                <div>
                  <label className="input-label">Кол-во букв</label>
                  <input type="number" className="input" value={calc.copies} placeholder="1" step="1" min="1"
                         onChange={e => setField('copies', String(Math.max(1, parseInt(e.target.value) || 1)))} />
                </div>
              </div>
              <div className="text-sm text-gray-500">
                {calc.quantity || 0} см × {result.unitPrice} сом × {calc.copies || 1} букв
                = <span className="font-medium">{formatCurrency(result.baseCost, lang)}</span>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {(isPrint || isVizitka) && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`btn flex-1 btn-toggle ${!calc.options?.two_side ? 'is-active' : ''}`}
                    onClick={() => toggleOpt('two_side', false)}
                  >
                    1-стор. {isPrint ? '(10/5 сом)' : '(5 сом)'}
                  </button>
                  <button
                    type="button"
                    className={`btn flex-1 btn-toggle ${calc.options?.two_side ? 'is-active' : ''}`}
                    onClick={() => toggleOpt('two_side', true)}
                  >
                    2-стор. {isPrint ? '(11 сом)' : '(6 сом)'}
                  </button>
                </div>
              )}
              <div>
                <label className="input-label">Количество ({svc?.unit || 'шт'})</label>
                <input type="number" className="input" value={calc.quantity} placeholder="1" step="1" min="0" onChange={e => setField('quantity', e.target.value)} />
                {showMinWarn && (
                  <div className="mt-1 text-sm text-orange-600 font-medium">
                    ⚠ Минимальный заказ: {svc.min_order} {svc.unit}
                  </div>
                )}
                {isPrint && result.discount && (
                  <div className="mt-1 text-sm text-green-600 font-medium">
                    ★ Скидка за объём: ≥ 100 листов → 5 сом/лист
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {result.options.length > 0 && (
          <div className="card space-y-2">
            <h3 className="font-bold text-sm text-gray-400 uppercase">Опции</h3>
            {result.options.map(opt => (
              <label key={opt.key} className="flex items-center gap-3 cursor-pointer py-1">
                <input type="checkbox" checked={!!calc.options[opt.key]} onChange={e => toggleOpt(opt.key, e.target.checked)} />
                <span className="flex-1">{opt.label}</span>
                {opt.price > 0 && <span className="text-sm text-gray-500">+ {formatCurrency(opt.price, lang)} / ед.</span>}
              </label>
            ))}
          </div>
        )}

        <div className="card">
          <h3 className="font-bold text-sm text-gray-400 uppercase mb-3">Итог</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Цена за единицу</span>
              <span className="font-medium">{formatCurrency(result.unitPrice, lang)} / {svc?.unit || 'ед.'}</span>
            </div>
            {area ? (
              <div className="flex justify-between"><span className="text-gray-500">Площадь × кол-во</span><span>{result.quantity} м²</span></div>
            ) : (
              <div className="flex justify-between"><span className="text-gray-500">Количество</span><span>{result.quantity} {svc?.unit || ''}</span></div>
            )}
            <div className="flex justify-between"><span className="text-gray-500">Стоимость услуги</span><span>{formatCurrency(result.baseCost, lang)}</span></div>
            {result.optionsCost > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">Опции</span><span>+ {formatCurrency(result.optionsCost, lang)}</span></div>
            )}
            <div className="border-t pt-3 mt-1 flex items-center justify-between">
              <span className="font-bold text-base">Итого</span>
              <span className="font-bold text-2xl text-blue-700">{formatCurrency(result.total, lang)}</span>
            </div>
          </div>
        </div>

        <button className="btn btn-primary btn-block btn-lg" onClick={toOrder}>Создать заказ из расчёта →</button>
      </div>
    </>
  );
}
