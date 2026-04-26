import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useRealtime } from '../lib/useRealtime.js';
import { roleLabel } from '../lib/utils.js';

const tr = (lang, ru, ky) => lang === 'ky' ? ky : ru;

function getItems(role, lang) {
  const t = (ru, ky) => tr(lang, ru, ky);
  // tone — цвет плашки под иконкой (точно как на референсном скриншоте)
  const ALL = {
    calculator:    { label: t('Калькулятор', 'Калькулятор'),       icon: '🧮', tone: 'amber',  path: '/calculator',       desc: t('Расчёт стоимости услуг', 'Кызматтардын баасын эсептөө') },
    announcements: { label: t('Объявления', 'Жарнамалар'),         icon: '📢', tone: 'orange', path: '/announcements',    desc: t('Сообщения сотрудникам', 'Кызматкерлерге билдирүү') },
    shiftChecklist:{ label: t('Чек-лист смены', 'Смена тизмеси'),  icon: '✅', tone: 'green',  path: '/shift-checklist',  desc: t('Настройка и контроль', 'Жөндөө жана көзөмөл') },
    pricelist:     { label: t('Прайс-лист', 'Баа тизмеси'),        icon: '💰', tone: 'yellow', path: '/pricelist',        desc: t('Цены на услуги', 'Кызмат баалары') },
    payroll:       { label: t('Зарплата', 'Айлык'),                icon: '💳', tone: 'blue',   path: '/payroll',          desc: t('Ежемесячный расчёт', 'Айлык эсеп') },
    fines:         { label: t('Журнал штрафов', 'Айып журналы'),   icon: '💸', tone: 'mint',   path: '/fines',            desc: t('История удержаний', 'Кармоо тарыхы') },
    workJournal:   { label: t('Журнал работы', 'Иш журналы'),      icon: '🕒', tone: 'pink',   path: '/work-journal',     desc: t('Часы, прогулы, KPI', 'Саат, келбей калуу, KPI') },
    leave:         { label: t('Отпуск / Больничный', 'Эс алуу / Ооруу'), icon: '🩺', tone: 'blue', path: '/leave-requests', desc: t('Заявки и согласование', 'Сурамдар жана бекитүү') },
    users:         { label: t('Сотрудники', 'Кызматкерлер'),       icon: '👥', tone: 'purple', path: '/users',            desc: t('Управление аккаунтами', 'Колдонуучуларды башкаруу') },
    training:      { label: t('Уроки', 'Сабактар'),                icon: '🎓', tone: 'dark',   path: '/training',         desc: t('Видео и фото инструкции', 'Видео жана сүрөт нускама') },
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
            <div className={`menu-row-icon menu-row-icon-${it.tone || 'blue'}`}>{it.icon}</div>
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
