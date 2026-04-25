import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { I18nProvider } from './lib/i18n.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { ModalProvider } from './components/Modal.jsx';
import './app.css';

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
