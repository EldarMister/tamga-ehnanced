import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const ICONS = {
  dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h5.1v-6.7h2.8V21h5.1V9.5"/></svg>,
  orders: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M8 5H6.8A2.8 2.8 0 0 0 4 7.8v11.4A2.8 2.8 0 0 0 6.8 22h10.4a2.8 2.8 0 0 0 2.8-2.8V7.8A2.8 2.8 0 0 0 17.2 5H16"/><rect x="8" y="2" width="8" height="5" rx="1.5"/><path d="M8 12h4M8 16h5M15 12l1 1 2-2"/></svg>,
  inventory: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 2.8 21 7.7v8.6l-9 4.9-9-4.9V7.7l9-4.9Z"/><path d="m3.4 7.9 8.6 4.8 8.6-4.8"/><path d="M12 12.7v8.1"/></svg>,
  hr: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="7" r="3.5"/><path d="M4.5 21v-2.2A5.8 5.8 0 0 1 10.3 13h3.4a5.8 5.8 0 0 1 5.8 5.8V21"/></svg>,
  profile: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  training: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 10v6M2 10v6"/><path d="M12 5 2 10l10 5 10-5-10-5Z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>,
  more: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="18" cy="12" r="2.2"/></svg>,
};

const LABELS = {
  ru: { dashboard: 'Главная', orders: 'Заказы', inventory: 'Склад', hr: 'Кадры', profile: 'Профиль', training: 'Уроки', more: 'Ещё' },
  ky: { dashboard: 'Башкы', orders: 'Буйрутма', inventory: 'Кампа', hr: 'Кадр', profile: 'Профиль', training: 'Сабак', more: 'Дагы' },
};

const COMMON = [
  { id: 'dashboard', path: '/dashboard', icon: 'dashboard' },
  { id: 'orders', path: '/orders', icon: 'orders' },
];
const TABS = {
  director:  [...COMMON, { id: 'inventory', path: '/inventory', icon: 'inventory' }, { id: 'hr', path: '/hr', icon: 'hr' }, { id: 'more', path: '/more', icon: 'more' }],
  manager:   [...COMMON, { id: 'inventory', path: '/inventory', icon: 'inventory' }, { id: 'hr', path: '/hr', icon: 'hr' }, { id: 'more', path: '/more', icon: 'more' }],
  designer:  [...COMMON, { id: 'hr', path: '/hr', icon: 'hr' }, { id: 'more', path: '/more', icon: 'more' }],
  master:    [...COMMON, { id: 'inventory', path: '/inventory', icon: 'inventory' }, { id: 'hr', path: '/hr', icon: 'hr' }, { id: 'more', path: '/more', icon: 'more' }],
  assistant: [...COMMON, { id: 'hr', path: '/hr', icon: 'hr' }, { id: 'more', path: '/more', icon: 'more' }],
};

export default function TabBar() {
  const { user, lang } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!user) return null;
  const tabs = TABS[user.role] || TABS.assistant;
  const labels = LABELS[lang] || LABELS.ru;

  return (
    <nav id="tab-bar" className="fixed bottom-0 left-0 right-0 z-40">
      <div className="max-w-screen-xl mx-auto flex justify-around items-center h-16">
        {tabs.map(tab => {
          const active = pathname === tab.path || (tab.path !== '/dashboard' && pathname.startsWith(tab.path));
          return (
            <a key={tab.id} className={`tab-item ${active ? 'active' : ''}`}
               onClick={(e) => { e.preventDefault(); navigate(tab.path); }}>
              {ICONS[tab.icon]}
              <span>{labels[tab.id] || tab.id}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
