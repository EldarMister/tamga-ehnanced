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
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20l-5 1 1-5 12.5-12.5Z" />
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
  at: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M16 15.5c-.8.7-1.7 1-2.7 1-2.4 0-4.3-1.8-4.3-4.5s1.9-4.5 4.3-4.5S18 9.3 18 12v3.5c0 1.1.9 2 2 2" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7l.7 4a2 2 0 0 1-.6 1.8l-1.8 1.8a16 16 0 0 0 5.7 5.7l1.8-1.8a2 2 0 0 1 1.8-.6l4 .7A2 2 0 0 1 22 16.9Z" />
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
  const displayName = user.full_name || user.username || tr(lang, 'Профиль', 'Профиль');
  const [pushState, setPushState] = useState({
    loading: true,
    supported: isPushSupported(),
    enabled: false,
    permission: 'default',
    subscribed: false,
  });

  const loadPushState = async () => {
    if (!isPushSupported()) {
      setPushState({
        loading: false,
        supported: false,
        enabled: false,
        permission: 'unsupported',
        subscribed: false,
      });
      return;
    }
    try {
      const info = await getPushConfig();
      setPushState({ loading: false, ...info });
    } catch {
      setPushState((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    loadPushState();
  }, []);

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
        {
          name: 'username',
          label: tr(lang, 'Логин', 'Колдонуучу'),
          type: 'text',
          required: true,
          value: user.username,
        },
        {
          name: 'phone',
          label: tr(lang, 'Телефон', 'Телефон'),
          type: 'text',
          value: user.phone || '',
        },
      ],
      submitText: tr(lang, 'Сохранить', 'Сактоо'),
      onSubmit: async (data) => {
        try {
          const updated = await api.patch('/api/users/me', data);
          if (updated) {
            updateUser({
              ...user,
              username: updated.username,
              phone: updated.phone,
            });
          }
          showToast(tr(lang, 'Профиль обновлён', 'Профиль жаңырды'), 'success');
        } catch {}
      },
    });
  };

  const changePassword = () => {
    showForm({
      title: tr(lang, 'Сменить пароль', 'Сырсөздү алмаштыруу'),
      fields: [
        {
          name: 'old_password',
          label: tr(lang, 'Текущий пароль', 'Учурдагы сырсөз'),
          type: 'password',
          required: true,
        },
        {
          name: 'new_password',
          label: tr(lang, 'Новый пароль', 'Жаңы сырсөз'),
          type: 'password',
          required: true,
        },
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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const enablePush = async () => {
    try {
      await subscribeToPush();
      await loadPushState();
      showToast(tr(lang, 'Уведомления включены', 'Билдирмелер күйгүзүлдү'), 'success');
    } catch (error) {
      showToast(
        error.message || tr(lang, 'Не удалось включить уведомления', 'Билдирмелерди күйгүзүү ишке ашкан жок'),
        'error',
      );
      await loadPushState();
    }
  };

  const disablePush = async () => {
    try {
      await unsubscribeFromPush();
      await loadPushState();
      showToast(tr(lang, 'Уведомления отключены', 'Билдирмелер өчүрүлдү'), 'success');
    } catch (error) {
      showToast(
        error.message || tr(lang, 'Не удалось отключить уведомления', 'Билдирмелерди өчүрүү ишке ашкан жок'),
        'error',
      );
    }
  };

  let pushTone = 'muted';
  let pushBadge = tr(lang, 'Проверка', 'Текшерүү');
  let pushStatus = tr(lang, 'Проверяем состояние уведомлений…', 'Билдирмелердин абалын текшерип жатабыз…');

  if (!pushState.supported) {
    pushTone = 'warning';
    pushBadge = tr(lang, 'Не поддерживается', 'Колдоого алынбайт');
    pushStatus = tr(
      lang,
      'Этот браузер не поддерживает push-уведомления.',
      'Бул браузер push-билдирмелерди колдобойт.',
    );
  } else if (!pushState.enabled) {
    pushTone = 'warning';
    pushBadge = tr(lang, 'Недоступно', 'Жеткиликсиз');
    pushStatus = tr(
      lang,
      'Push-сервер ещё не настроен.',
      'Push-сервер али толук жөндөлө элек.',
    );
  } else if (pushState.permission === 'denied') {
    pushTone = 'warning';
    pushBadge = tr(lang, 'Запрещено', 'Тыюу салынган');
    pushStatus = tr(
      lang,
      'Разрешение браузера отключено. Включите уведомления в настройках сайта.',
      'Браузер уруксаты өчүрүлгөн. Сайттын жөндөөлөрүнөн билдирмелерди кайра күйгүзүңүз.',
    );
  } else if (pushState.subscribed) {
    pushTone = 'positive';
    pushBadge = tr(lang, 'Активно', 'Жигердүү');
    pushStatus = tr(
      lang,
      'Уведомления будут приходить даже при закрытом сайте.',
      'Сайт жабык болсо да билдирмелер келип турат.',
    );
  } else {
    pushTone = 'muted';
    pushBadge = tr(lang, 'Выключено', 'Өчүк');
    pushStatus = tr(
      lang,
      'Нажмите кнопку ниже, чтобы получать уведомления на телефон и компьютер.',
      'Телефонго жана компьютерге билдирмелерди алуу үчүн төмөнкү баскычты басыңыз.',
    );
  }

  return (
    <main className="profile-page">
      <header className="page-header profile-page-header">
        <div className="profile-page-heading">
          <span className="profile-page-eyebrow">{tr(lang, 'Аккаунт', 'Аккаунт')}</span>
          <h1 className="page-title profile-page-title">{tr(lang, 'Профиль', 'Профиль')}</h1>
        </div>
        <div></div>
      </header>

      <div className="profile-page-content">
        <section className="profile-hero-card">
          <div className="profile-hero-highlight" aria-hidden="true"></div>
          <div className="profile-avatar">{initial(displayName)}</div>
          <div className="profile-hero-name">{displayName}</div>
          <div className="profile-hero-role">{roleLabel(user.role, lang)}</div>
          <div className="profile-hero-meta">
            <div className="profile-hero-pill">
              <span className="profile-hero-pill-icon">{ICONS.at}</span>
              <span>{user.username}</span>
            </div>
            {user.phone && (
              <div className="profile-hero-pill">
                <span className="profile-hero-pill-icon">{ICONS.phone}</span>
                <span>{user.phone}</span>
              </div>
            )}
          </div>
        </section>

        {isDirector && (
          <button type="button" className="profile-primary-action" onClick={editProfile}>
            <span className="profile-primary-action-icon">{ICONS.edit}</span>
            <span>{tr(lang, 'Редактировать профиль', 'Профилди оңдоо')}</span>
          </button>
        )}

        <section className="profile-card">
          <div className="profile-card-head">
            <div className="profile-card-label">{tr(lang, 'Язык / Тил', 'Тил / Язык')}</div>
          </div>

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

        <section className="profile-card">
          <div className="profile-card-head">
            <div className="profile-card-label">
              {tr(lang, 'Push-уведомления', 'Push-билдирмелер')}
            </div>
            <div className={`profile-status-badge profile-status-badge-${pushTone}`}>{pushBadge}</div>
          </div>

          <div className={`profile-push-summary profile-push-summary-${pushTone}`}>
            <span className="profile-push-summary-icon">{ICONS.bell}</span>
            <span>{pushStatus}</span>
          </div>

          <p className="profile-card-note">
            {tr(
              lang,
              'Для звука разрешите уведомления для сайта в браузере и системе.',
              'Үн чыгышы үчүн браузерде жана тутумда сайттын билдирмелерине уруксат бериңиз.',
            )}
          </p>

          {pushState.supported && pushState.enabled && pushState.permission !== 'denied' && (
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

        <section className="profile-shortcuts-card">
          <button type="button" className="profile-shortcut-row" onClick={() => navigate('/training')}>
            <span className="profile-shortcut-icon profile-shortcut-icon-blue">{ICONS.cap}</span>
            <span className="profile-shortcut-copy">
              <span className="profile-shortcut-title">{tr(lang, 'Уроки', 'Сабактар')}</span>
              <span className="profile-shortcut-text">
                {tr(lang, 'Видео и фото инструкции', 'Видео жана сүрөт нускамалар')}
              </span>
            </span>
            <span className="profile-shortcut-chevron">{ICONS.chevron}</span>
          </button>

          <button type="button" className="profile-shortcut-row" onClick={changePassword}>
            <span className="profile-shortcut-icon profile-shortcut-icon-slate">{ICONS.lock}</span>
            <span className="profile-shortcut-copy">
              <span className="profile-shortcut-title">{tr(lang, 'Сменить пароль', 'Сырсөздү алмаштыруу')}</span>
              <span className="profile-shortcut-text">
                {tr(lang, 'Обновить доступ к аккаунту', 'Аккаунтка кирүү мүмкүнчүлүгүн жаңыртуу')}
              </span>
            </span>
            <span className="profile-shortcut-chevron">{ICONS.chevron}</span>
          </button>
        </section>

        <button type="button" className="profile-danger-action" onClick={handleLogout}>
          <span className="profile-danger-action-icon">{ICONS.logout}</span>
          <span>{tr(lang, 'Выйти', 'Чыгуу')}</span>
        </button>
      </div>
    </main>
  );
}
