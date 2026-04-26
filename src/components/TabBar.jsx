import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const ICONS = {
  dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="14" y="10" width="7" height="11" rx="1"/><rect x="3" y="13" width="7" height="8" rx="1"/></svg>,
  orders: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg>,
  inventory: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.27 6.96 8.73 5.04 8.73-5.04"/><path d="M12 22.08V12"/></svg>,
  hr: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  profile: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  training: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 10v6M2 10v6"/><path d="M12 5 2 10l10 5 10-5-10-5Z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>,
  more: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>,
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
