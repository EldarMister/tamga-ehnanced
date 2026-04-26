import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useModal } from '../components/Modal.jsx';
import { roleLabel } from '../lib/utils.js';
import { getPushConfig, isPushSupported, subscribeToPush, unsubscribeFromPush } from '../lib/push.js';

const tr = (lang, ru, ky) => (lang === 'ky' ? ky : ru);

const ICONS = {
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="3" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </svg>
  ),
  cap: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
      <path d="M22 10v6" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
};

function initial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase();
}

export default function Profile() {
  const { user, lang, logout, updateUser, setLang } = useAuth();
  const showToast = useToast();
  const { showForm } = useModal();
  const navigate = useNavigate();
  const isDirector = user.role === 'director';
  const displayName = user.full_name || user.username || 'Профиль';

  const [pushState, setPushState] = useState({
    loading: true,
    supported: isPushSupported(),
    enabled: false,
    permission: 'default',
    subscribed: false,
  });

  const loadPushState = async () => {
    if (!isPushSupported()) {
      setPushState({ loading: false, supported: false, enabled: false, permission: 'unsupported', subscribed: false });
      return;
    }
    try {
      const info = await getPushConfig();
      setPushState({ loading: false, ...info });
    } catch {
      setPushState((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => { loadPushState(); }, []);

  const switchLang = async (newLang) => {
    if (newLang === lang) return;
    try {
      await api.patch(`/api/users/me/lang?lang=${newLang}`);
      setLang(newLang);
      showToast(newLang === 'ru' ? 'Язык: Русский' : 'Тил: Кыргызча', 'success');
    } catch {}
  };

  const editProfile = () => {
    showForm({
      title: tr(lang, 'Редактировать профиль', 'Профилди оңдоо'),
      fields: [
        { name: 'username', label: tr(lang, 'Логин', 'Колдонуучу'), type: 'text', required: true, value: user.username },
        { name: 'phone', label: tr(lang, 'Телефон', 'Телефон'), type: 'text', value: user.phone || '' },
      ],
      submitText: tr(lang, 'Сохранить', 'Сактоо'),
      onSubmit: async (data) => {
        try {
          const updated = await api.patch('/api/users/me', data);
          if (updated) updateUser({ ...user, username: updated.username, phone: updated.phone });
          showToast(tr(lang, 'Профиль обновлён', 'Профиль жаңырды'), 'success');
        } catch {}
      },
    });
  };

  const changePassword = () => {
    showForm({
      title: tr(lang, 'Сменить пароль', 'Сырсөздү алмаштыруу'),
      fields: [
        { name: 'old_password', label: tr(lang, 'Текущий пароль', 'Учурдагы сырсөз'), type: 'password', required: true },
        { name: 'new_password', label: tr(lang, 'Новый пароль', 'Жаңы сырсөз'), type: 'password', required: true },
      ],
      submitText: tr(lang, 'Сменить', 'Алмаштыруу'),
      onSubmit: async (data) => {
        try {
          await api.post('/api/auth/change-password', data);
          showToast(tr(lang, 'Пароль изменён', 'Сырсөз өзгөртүлдү'), 'success');
        } catch {}
      },
    });
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const enablePush = async () => {
    try {
      await subscribeToPush();
      await loadPushState();
      showToast(tr(lang, 'Уведомления включены', 'Билдирмелер күйгүзүлдү'), 'success');
    } catch (error) {
      showToast(error.message || tr(lang, 'Не удалось включить уведомления', 'Билдирмелерди күйгүзүү ишке ашкан жок'), 'error');
      await loadPushState();
    }
  };

  const disablePush = async () => {
    try {
      await unsubscribeFromPush();
      await loadPushState();
      showToast(tr(lang, 'Уведомления отключены', 'Билдирмелер өчүрүлдү'), 'success');
    } catch (error) {
      showToast(error.message || tr(lang, 'Не удалось отключить уведомления', 'Билдирмелерди өчүрүү ишке ашкан жок'), 'error');
    }
  };

  let pushStatus = tr(lang, 'Проверяем состояние уведомлений…', 'Билдирмелердин абалын текшерип жатабыз…');
  if (!pushState.supported) {
    pushStatus = tr(lang, 'Этот браузер не поддерживает push-уведомления.', 'Бул браузер push-билдирмелерди колдобойт.');
  } else if (!pushState.enabled) {
    pushStatus = tr(lang, 'Push-сервер ещё не настроен.', 'Push-сервер али толук жөндөлө элек.');
  } else if (pushState.permission === 'denied') {
    pushStatus = tr(lang, 'Разрешение браузера отключено. Включите уведомления в настройках сайта.', 'Браузер уруксаты өчүрүлгөн. Сайттын жөндөөлөрүнөн билдирмелерди кайра күйгүзүңүз.');
  } else if (pushState.subscribed) {
    pushStatus = tr(lang, 'Уведомления будут приходить даже при закрытом сайте.', 'Сайт жабык болсо да билдирмелер келип турат.');
  } else {
    pushStatus = tr(lang, 'Нажмите кнопку ниже, чтобы получать уведомления на телефон и компьютер.', 'Телефонго жана компьютерге билдирмелерди алуу үчүн төмөнкү баскычты басыңыз.');
  }

  const showPushButton = pushState.supported && pushState.enabled && pushState.permission !== 'denied';

  return (
    <main className="profile-page">
      <header className="profile-page-header">
        <h1 className="profile-page-title">{tr(lang, 'Профиль', 'Профиль')}</h1>
      </header>

      <div className="profile-page-content">

        {/* Hero card */}
        <section className="profile-hero-card">
          <div className="profile-avatar">{initial(displayName)}</div>
          <div className="profile-hero-name">{displayName}</div>
          <div className="profile-hero-role">{roleLabel(user.role, lang)}</div>
          <div className="profile-hero-username">{user.username}</div>
        </section>

        {/* Edit button — director only */}
        {isDirector && (
          <button type="button" className="profile-primary-action" onClick={editProfile}>
            <span className="profile-primary-action-icon">{ICONS.user}</span>
            <span>{tr(lang, 'Редактировать профиль', 'Профилди оңдоо')}</span>
          </button>
        )}

        {/* Language */}
        <section className="profile-card">
          <div className="profile-card-label">{tr(lang, 'Язык / Тил', 'Тил / Язык')}</div>
          <div className="profile-language-switch" role="tablist" aria-label={tr(lang, 'Выбор языка', 'Тилди тандоо')}>
            <button
              type="button"
              className={`profile-language-option ${lang === 'ru' ? 'is-active' : ''}`}
              onClick={() => switchLang('ru')}
              aria-pressed={lang === 'ru'}
            >
              <span className="profile-language-option-icon">{ICONS.globe}</span>
              <span>Русский</span>
            </button>
            <button
              type="button"
              className={`profile-language-option ${lang === 'ky' ? 'is-active' : ''}`}
              onClick={() => switchLang('ky')}
              aria-pressed={lang === 'ky'}
            >
              <span className="profile-language-option-icon">{ICONS.globe}</span>
              <span>Кыргызча</span>
            </button>
          </div>
        </section>

        {/* Push notifications */}
        <section className="profile-card">
          <div className="profile-card-label profile-card-label-accent">
            {tr(lang, 'Push-уведомления', 'Push-билдирмелер')}
          </div>
          <p className="profile-push-body">{pushStatus}</p>
          <p className="profile-card-note">
            {tr(
              lang,
              'Для звука разрешите уведомления для сайта в браузере и системе.',
              'Үн чыгышы үчүн браузерде жана тутумда сайттын билдирмелерине уруксат бериңиз.',
            )}
          </p>
          {showPushButton && (
            <button
              type="button"
              className={`profile-push-action ${pushState.subscribed ? 'is-secondary' : ''}`}
              onClick={pushState.subscribed ? disablePush : enablePush}
              disabled={pushState.loading}
            >
              <span className="profile-push-action-icon">{ICONS.bell}</span>
              <span>
                {pushState.subscribed
                  ? tr(lang, 'Отключить уведомления', 'Билдирмелерди өчүрүү')
                  : tr(lang, 'Включить уведомления', 'Билдирмелерди күйгүзүү')}
              </span>
            </button>
          )}
        </section>

        {/* Shortcuts — each its own card */}
        <button type="button" className="profile-shortcut-card" onClick={() => navigate('/training')}>
          <span className="profile-shortcut-icon profile-shortcut-icon-blue">{ICONS.cap}</span>
          <span className="profile-shortcut-title">{tr(lang, 'Уроки', 'Сабактар')}</span>
          <span className="profile-shortcut-chevron">{ICONS.chevron}</span>
        </button>

        <button type="button" className="profile-shortcut-card" onClick={changePassword}>
          <span className="profile-shortcut-icon profile-shortcut-icon-blue">{ICONS.lock}</span>
          <span className="profile-shortcut-title">{tr(lang, 'Сменить пароль', 'Сырсөздү алмаштыруу')}</span>
          <span className="profile-shortcut-chevron">{ICONS.chevron}</span>
        </button>

        {/* Logout */}
        <button type="button" className="profile-danger-action" onClick={handleLogout}>
          <span className="profile-danger-action-icon">{ICONS.logout}</span>
          <span>{tr(lang, 'Выйти', 'Чыгуу')}</span>
        </button>

      </div>
    </main>
  );
}
