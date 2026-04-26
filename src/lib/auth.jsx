import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { startRealtime, stopRealtime } from './realtime.js';

const AuthContext = createContext(null);

function loadInitial() {
  try {
    const token = localStorage.getItem('pc_token');
    const userData = localStorage.getItem('pc_user');
    const user = userData ? JSON.parse(userData) : null;
    return { token, user, lang: user?.lang || 'ru' };
  } catch {
    return { token: null, user: null, lang: 'ru' };
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(loadInitial);

  const login = useCallback((token, user) => {
    localStorage.setItem('pc_token', token);
    localStorage.setItem('pc_user', JSON.stringify(user));
    setAuth({ token, user, lang: user.lang || 'ru' });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('pc_token');
    localStorage.removeItem('pc_user');
    setAuth({ token: null, user: null, lang: 'ru' });
  }, []);

  const updateUser = useCallback((user) => {
    localStorage.setItem('pc_user', JSON.stringify(user));
    setAuth(prev => ({ ...prev, user, lang: user.lang || prev.lang }));
  }, []);

  const setLang = useCallback((lang) => {
    setAuth(prev => {
      const user = prev.user ? { ...prev.user, lang } : null;
      if (user) localStorage.setItem('pc_user', JSON.stringify(user));
      return { ...prev, user, lang };
    });
  }, []);

  useEffect(() => {
    const handler = () => {
      // re-sync from storage if changed in another tab
      setAuth(loadInitial());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Авто-старт SSE-соединения при наличии токена.
  useEffect(() => {
    if (auth.token) startRealtime();
    else stopRealtime();
  }, [auth.token]);

  return (
    <AuthContext.Provider value={{ ...auth, login, logout, updateUser, setLang }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Token getter for non-component code (api client)
export function getToken() {
  return localStorage.getItem('pc_token');
}

export function clearAuthStorage() {
  localStorage.removeItem('pc_token');
  localStorage.removeItem('pc_user');
}
