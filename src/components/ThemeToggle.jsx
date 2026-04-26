import { useEffect, useState } from 'react';

function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
}

function readSavedTheme() {
  return localStorage.getItem('pc_theme') === 'dark' ? 'dark' : 'light';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(readSavedTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('pc_theme', theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <button
      className="theme-toggle global-theme-toggle"
      aria-label="Переключить тему"
      aria-pressed={theme === 'dark'}
      title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      onClick={toggle}
    >
      <span className="theme-toggle-icon theme-toggle-sun">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      </span>
      <span className="theme-toggle-icon theme-toggle-moon">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 14.4A8.2 8.2 0 0 1 9.6 3a9.2 9.2 0 1 0 11.4 11.4Z" />
        </svg>
      </span>
    </button>
  );
}
