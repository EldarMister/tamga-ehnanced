import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Workbox } from 'workbox-window';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { I18nProvider } from './lib/i18n.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { ModalProvider } from './components/Modal.jsx';
import './app.css';

if ('serviceWorker' in navigator) {
  const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  const workbox = new Workbox(`${baseUrl}sw.js`, {
    scope: baseUrl,
    type: 'classic',
    updateViaCache: 'none',
  });

  let reloadingForServiceWorker = false;

  workbox.addEventListener('waiting', () => {
    workbox.messageSkipWaiting();
  });

  workbox.addEventListener('controlling', () => {
    if (reloadingForServiceWorker) return;
    reloadingForServiceWorker = true;
    window.location.reload();
  });

  workbox
    .register({ immediate: true })
    .then((registration) => {
      if (!registration) return;

      const checkForUpdate = () => registration.update().catch(() => {});
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      };

      checkForUpdate();

      const intervalId = window.setInterval(checkForUpdate, 60 * 1000);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener(
        'beforeunload',
        () => {
          window.clearInterval(intervalId);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        },
        { once: true },
      );
    })
    .catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <I18nProvider>
          <ToastProvider>
            <ModalProvider>
              <App />
            </ModalProvider>
          </ToastProvider>
        </I18nProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
