import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useModal } from '../components/Modal.jsx';
import { roleLabel } from '../lib/utils.js';

const tr = (lang, ru, ky) => lang === 'ky' ? ky : ru;

export default function Profile() {
  const { user, lang, logout, updateUser, setLang } = useAuth();
  const showToast = useToast();
  const { showForm } = useModal();
  const navigate = useNavigate();
  const isDirector = user.role === 'director';

  const switchLang = async (newLang) => {
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

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{tr(lang, 'Профиль', 'Профиль')}</h1>
        <div></div>
      </div>
      <div className="px-4 space-y-4 pb-8">
        <div className="card text-center">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl font-bold text-blue-800">{user.full_name.charAt(0)}</span>
          </div>
          <div className="font-bold text-xl">{user.full_name}</div>
          <div className="text-gray-500">{roleLabel(user.role, lang)}</div>
          <div className="text-gray-400 mt-1">{user.username}</div>
          {user.phone && <div className="text-gray-400 mt-1">{user.phone}</div>}
        </div>

        {isDirector && (
          <button className="btn btn-secondary btn-block" onClick={editProfile}>
            {tr(lang, 'Редактировать профиль', 'Профилди оңдоо')}
          </button>
        )}

        <div className="card">
          <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">{tr(lang, 'Язык / Тил', 'Тил / Язык')}</h3>
          <div className="flex gap-2">
            <button className={`btn flex-1 ${lang === 'ru' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchLang('ru')}>Русский</button>
            <button className={`btn flex-1 ${lang === 'ky' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchLang('ky')}>Кыргызча</button>
          </div>
        </div>

        <button className="btn btn-secondary btn-block" onClick={() => navigate('/training')}>{tr(lang, 'Уроки', 'Сабактар')}</button>
        <button className="btn btn-secondary btn-block" onClick={changePassword}>{tr(lang, 'Сменить пароль', 'Сырсөздү алмаштыруу')}</button>
        <button className="btn btn-danger btn-block" onClick={handleLogout}>{tr(lang, 'Выйти', 'Чыгуу')}</button>
      </div>
    </>
  );
}
