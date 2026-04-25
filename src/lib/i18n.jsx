import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './auth.jsx';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const { lang } = useAuth();
  const [translations, setTranslations] = useState({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setReady(false);
      try {
        const res = await fetch(`/lang/${lang || 'ru'}.json`);
        const data = await res.json();
        if (!cancelled) { setTranslations(data); setReady(true); }
      } catch {
        if (lang !== 'ru') {
          try {
            const res = await fetch('/lang/ru.json');
            const data = await res.json();
            if (!cancelled) { setTranslations(data); setReady(true); }
          } catch { if (!cancelled) setReady(true); }
        } else if (!cancelled) {
          setReady(true);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [lang]);

  const t = useCallback((key) => {
    const parts = key.split('.');
    let val = translations;
    for (const p of parts) {
      if (val && typeof val === 'object') val = val[p];
      else return key;
    }
    return val || key;
  }, [translations]);

  return (
    <I18nContext.Provider value={{ t, lang, ready }}>
      {ready ? children : null}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
