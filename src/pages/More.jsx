import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const tr = (lang, ru, ky) => lang === 'ky' ? ky : ru;

function getItems(role, lang) {
  const t = (ru, ky) => tr(lang, ru, ky);
  const ALL = {
    calculator: { label: t('Калькулятор', 'Калькулятор'), icon: '🧮', path: '/calculator', desc: t('Расчёт стоимости услуг', 'Кызматтардын баасын эсептөө') },
    announcements: { label: t('Объявления', 'Жарнамалар'), icon: '📢', path: '/announcements', desc: t('Сообщения сотрудникам', 'Кызматкерлерге билдирүү') },
    shiftChecklist: { label: t('Чек-лист смены', 'Смена тизмеси'), icon: '✅', path: '/shift-checklist', desc: t('Настройка и контроль', 'Жөндөө жана көзөмөл') },
    pricelist: { label: t('Прайс-лист', 'Баа тизмеси'), icon: '💰', path: '/pricelist', desc: t('Цены на услуги', 'Кызмат баалары') },
    payroll: { label: t('Зарплата', 'Айлык'), icon: '💳', path: '/payroll', desc: t('Ежемесячный расчёт', 'Айлык эсеп') },
    fines: { label: t('Журнал штрафов', 'Айып журналы'), icon: '💸', path: '/fines', desc: t('История удержаний', 'Кармоо тарыхы') },
    workJournal: { label: t('Журнал работы', 'Иш журналы'), icon: '🕒', path: '/work-journal', desc: t('Часы, прогулы, KPI', 'Саат, келбей калуу, KPI') },
    leave: { label: t('Отпуск / Больничный', 'Эс алуу / Ооруу'), icon: '🩺', path: '/leave-requests', desc: t('Заявки и согласование', 'Сурамдар жана бекитүү') },
    users: { label: t('Сотрудники', 'Кызматкерлер'), icon: '👥', path: '/users', desc: t('Управление аккаунтами', 'Колдонуучуларды башкаруу') },
    reports: { label: t('Отчёты', 'Отчеттор'), icon: '📊', path: '/reports', desc: t('Аналитика и статистика', 'Аналитика жана статистика') },
    training: { label: t('Уроки', 'Сабактар'), icon: '🎓', path: '/training', desc: t('Видео и фото инструкции', 'Видео жана сүрөт нускама') },
    profile: { label: t('Профиль', 'Профиль'), icon: '👤', path: '/profile', desc: t('Настройки аккаунта', 'Аккаунт жөндөөлөрү') },
  };
  if (role === 'director') {
    return ['calculator','announcements','shiftChecklist','pricelist','payroll','fines','workJournal','leave','users','reports','training','profile'].map(k => ALL[k]);
  }
  if (role === 'manager') {
    return ['calculator','announcements','pricelist','fines','workJournal','leave','training','profile'].map(k => ALL[k]);
  }
  return ['calculator','announcements','workJournal','leave','training','profile'].map(k => ALL[k]);
}

export default function More() {
  const { user, lang } = useAuth();
  const navigate = useNavigate();
  const items = getItems(user.role, lang);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{tr(lang, 'Ещё', 'Дагы')}</h1>
        <div></div>
      </div>
      <div className="px-4 space-y-3 pb-8">
        {items.map((it, i) => (
          <a key={i} className="card flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow"
             onClick={() => navigate(it.path)}>
            <div className="text-3xl">{it.icon}</div>
            <div>
              <div className="font-bold">{it.label}</div>
              <div className="text-sm text-gray-500">{it.desc}</div>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}
