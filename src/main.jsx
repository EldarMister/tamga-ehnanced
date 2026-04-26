import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { I18nProvider } from './lib/i18n.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { ModalProvider } from './components/Modal.jsx';
import './app.css';

let reloadingForServiceWorker = false;
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    const checkForUpdate = () => registration.update().catch(() => {});
    checkForUpdate();

    const intervalId = window.setInterval(checkForUpdate, 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    });
    window.addEventListener('beforeunload', () => window.clearInterval(intervalId), { once: true });
  },
  onNeedRefresh() {
    updateSW(true);
  },
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForServiceWorker) return;
    reloadingForServiceWorker = true;
    window.location.reload();
  });
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
  </React.StrictMode>
);
