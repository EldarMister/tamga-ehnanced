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
      <span className="theme-toggle-icon theme-toggle-sun">☀️</span>
      <span className="theme-toggle-icon theme-toggle-moon">🌙</span>
    </button>
  );
}
