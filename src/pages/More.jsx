import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useRealtime } from '../lib/useRealtime.js';
import { roleLabel } from '../lib/utils.js';

const tr = (lang, ru, ky) => lang === 'ky' ? ky : ru;

// Чистые SVG-иконки в стиле Heroicons (outline, stroke-width 1.8). Без emoji.
const SVG = {
  calculator: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8"/><circle cx="8.5" cy="12" r="0.5" fill="currentColor"/><circle cx="12" cy="12" r="0.5" fill="currentColor"/><circle cx="15.5" cy="12" r="0.5" fill="currentColor"/><circle cx="8.5" cy="16" r="0.5" fill="currentColor"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/><circle cx="15.5" cy="16" r="0.5" fill="currentColor"/></svg>,
  megaphone:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M14 8a4 4 0 0 1 0 8"/><path d="M17 5a7 7 0 0 1 0 14"/></svg>,
  check:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m8 12 3 3 5-6"/></svg>,
  pricetag:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z"/><circle cx="8.5" cy="8.5" r="1.5"/></svg>,
  card:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h3"/></svg>,
  cash:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M5 9v.01M19 15v.01"/></svg>,
  clock:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  health:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4v5a4 4 0 0 0 4 4 4 4 0 0 0 4-4V4"/><path d="M5 4h2M11 4h2"/><path d="M9 13v3a4 4 0 0 0 4 4 4 4 0 0 0 4-4v-1.5"/><circle cx="17" cy="11" r="2"/></svg>,
  users:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  cap:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/><path d="M22 10v6"/></svg>,
};

function getItems(role, lang) {
  const t = (ru, ky) => tr(lang, ru, ky);
  // tone — цвет плашки под иконкой (точно как на референсе)
  const ALL = {
    calculator:    { label: t('Калькулятор', 'Калькулятор'),       svg: SVG.calculator, tone: 'amber',  path: '/calculator',       desc: t('Расчёт стоимости услуг', 'Кызматтардын баасын эсептөө') },
    announcements: { label: t('Объявления', 'Жарнамалар'),         svg: SVG.megaphone,  tone: 'orange', path: '/announcements',    desc: t('Сообщения сотрудникам', 'Кызматкерлерге билдирүү') },
    shiftChecklist:{ label: t('Чек-лист смены', 'Смена тизмеси'),  svg: SVG.check,      tone: 'green',  path: '/shift-checklist',  desc: t('Настройка и контроль', 'Жөндөө жана көзөмөл') },
    pricelist:     { label: t('Прайс-лист', 'Баа тизмеси'),        svg: SVG.pricetag,   tone: 'yellow', path: '/pricelist',        desc: t('Цены на услуги', 'Кызмат баалары') },
    payroll:       { label: t('Зарплата', 'Айлык'),                svg: SVG.card,       tone: 'blue',   path: '/payroll',          desc: t('Ежемесячный расчёт', 'Айлык эсеп') },
    fines:         { label: t('Журнал штрафов', 'Айып журналы'),   svg: SVG.cash,       tone: 'mint',   path: '/fines',            desc: t('История удержаний', 'Кармоо тарыхы') },
    workJournal:   { label: t('Журнал работы', 'Иш журналы'),      svg: SVG.clock,      tone: 'pink',   path: '/work-journal',     desc: t('Часы, прогулы, KPI', 'Саат, келбей калуу, KPI') },
    leave:         { label: t('Отпуск / Больничный', 'Эс алуу / Ооруу'), svg: SVG.health, tone: 'blue', path: '/leave-requests', desc: t('Заявки и согласование', 'Сурамдар жана бекитүү') },
    users:         { label: t('Сотрудники', 'Кызматкерлер'),       svg: SVG.users,      tone: 'purple', path: '/users',            desc: t('Управление аккаунтами', 'Колдонуучуларды башкаруу') },
    training:      { label: t('Уроки', 'Сабактар'),                svg: SVG.cap,        tone: 'dark',   path: '/training',         desc: t('Видео и фото инструкции', 'Видео жана сүрөт нускама') },
  };
  if (role === 'director') return ['calculator','announcements','shiftChecklist','pricelist','payroll','fines','workJournal','leave','users','training'].map(k => ALL[k]);
  if (role === 'manager')  return ['calculator','announcements','pricelist','fines','workJournal','leave','training'].map(k => ALL[k]);
  return ['calculator','announcements','workJournal','leave','training'].map(k => ALL[k]);
}

function initial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase();
}

function fmtElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function parseTs(value) {
  if (!value) return null;
  let raw = String(value).trim().replace(' ', 'T');
  // Postgres CURRENT_TIMESTAMP::text возвращает таймзону как "+00" без минут — JS не парсит.
  // Нормализуем в "+HH:MM": "+0500" → "+05:00", "+05" → "+05:00".
  raw = raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  raw = raw.replace(/([+-]\d{2})$/, '$1:00');
  // Если таймзоны нет вообще — считаем UTC.
  const hasTz = /[Zz]$|[+-]\d{2}:\d{2}$/.test(raw);
  if (!hasTz) raw += 'Z';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export default function More() {
  const { user, lang } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();
  const items = getItems(user.role, lang);

  const [attendance, setAttendance] = useState(undefined); // undefined=loading, null=none, object=data
  const [now, setNow] = useState(Date.now());

  const loadShift = useCallback(async () => {
    try {
      api.clearCache('/api/hr/my-attendance');
      const a = await api.get('/api/hr/my-attendance');
      setAttendance(a || null);
    } catch { setAttendance(null); }
  }, []);

  useEffect(() => { loadShift(); }, [loadShift]);
  useRealtime('hr:attendance', loadShift);

  // Тикаем секундомер только пока пользователь на смене (не завершено).
  useEffect(() => {
    if (!attendance || attendance.check_out) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [attendance]);

  const checkin = async () => {
    try { await api.post('/api/hr/checkin'); showToast(tr(lang,'Смена начата!','Смена башталды!'),'success'); loadShift(); } catch {}
  };
  const checkout = async () => {
    try {
      const result = await api.post('/api/hr/checkout');
      const summary = result?.shift_tasks_summary;
      if (summary && summary.not_completed > 0) {
        showToast(tr(lang, `Смена завершена. Выполнено: ${summary.completed}/${summary.total}`, `Смена аякталды. Аткарылды: ${summary.completed}/${summary.total}`), 'warning');
      } else {
        showToast(tr(lang,'Смена завершена!','Смена аякталды!'),'success');
      }
      loadShift();
    } catch {}
  };

  const goToHr = () => navigate('/hr');

  // ─── Состояние карточки смены ─────────────────────────────────────────────
  let shiftCard;
  if (attendance === undefined) {
    shiftCard = <div className="more-shift-card more-shift-loading"><div className="spinner"></div></div>;
  } else if (!attendance) {
    // Не отметился — большая кнопка начать смену
    shiftCard = (
      <button className="more-shift-card more-shift-empty" onClick={checkin}>
        <div className="more-shift-icon">☀️</div>
        <div className="more-shift-text">
          <div className="more-shift-title">{tr(lang,'Начать смену','Сменаны баштоо')}</div>
          <div className="more-shift-sub">{tr(lang,'Отметиться о приходе','Келдим деп белгилөө')}</div>
        </div>
      </button>
    );
  } else if (!attendance.check_out) {
    // На смене — счётчик + завершить, клик по карточке → /hr
    const start = parseTs(attendance.check_in);
    const elapsed = start ? fmtElapsed(now - start.getTime()) : '00:00:00';
    shiftCard = (
      <div className="more-shift-card more-shift-active" onClick={goToHr}>
        <div className="more-shift-icon more-shift-icon-clock">
          <img src="/icons/clock.png" alt="" draggable={false} />
        </div>
        <div className="more-shift-text">
          <div className="more-shift-title">
            {tr(lang,'Работаю','Иштеп жатам')}
            <span className="more-shift-arrow">›</span>
          </div>
          <div className="more-shift-time">{elapsed}</div>
        </div>
        <button
          className="btn btn-primary more-shift-action"
          onClick={(e) => { e.stopPropagation(); checkout(); }}
        >
          {tr(lang,'Завершить','Аяктоо')}
        </button>
      </div>
    );
  } else {
    // Смена закончена за сегодня
    shiftCard = (
      <div className="more-shift-card more-shift-done" onClick={goToHr}>
        <div className="more-shift-icon" style={{ background: 'rgba(255,255,255,0.2)' }}>✓</div>
        <div className="more-shift-text">
          <div className="more-shift-title">
            {tr(lang,'Смена завершена','Смена аякталды')}
            <span className="more-shift-arrow">›</span>
          </div>
          <div className="more-shift-sub">{tr(lang,'История на странице кадров','Тарыхы кадр баракчасында')}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{tr(lang, 'Меню', 'Меню')}</h1>
        <div></div>
      </div>
      <div className="px-4 space-y-3 pb-8">
        {/* Hero: профиль */}
        <button className="more-profile-card" onClick={() => navigate('/profile')}>
          <div className="more-profile-avatar">{initial(user.full_name)}</div>
          <div className="more-profile-text">
            <div className="more-profile-name">
              {user.full_name}
              <span className="more-shift-arrow">›</span>
            </div>
            <div className="more-profile-role">{roleLabel(user.role, lang)}</div>
          </div>
        </button>

        {/* Hero: смена */}
        {shiftCard}

        {/* Остальные пункты меню */}
        {items.map((it, i) => (
          <a key={i} className="menu-row" onClick={() => navigate(it.path)}>
            <div className={`menu-row-icon menu-row-icon-${it.tone || 'blue'}`}>{it.svg}</div>
            <div className="menu-row-text">
              <div className="menu-row-title">{it.label}</div>
              <div className="menu-row-desc">{it.desc}</div>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}
