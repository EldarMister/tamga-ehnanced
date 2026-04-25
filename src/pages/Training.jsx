import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useModal } from '../components/Modal.jsx';
import { roleLabel, buildUploadUrl } from '../lib/utils.js';

const getYouTubeId = (url) => {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
};

export default function Training() {
  const { user, lang } = useAuth();
  const showToast = useToast();
  const { showForm, showConfirm } = useModal();
  const canManage = user.role === 'director';
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setItems(null); setError(false);
    try {
      api.clearCache('/api/training');
      const data = await api.get('/api/training');
      setItems(data || []);
    } catch { setError(true); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const watch = async (id) => {
    try { await api.patch(`/api/training/${id}/watch`); showToast('Отмечено', 'success'); load(); } catch {}
  };

  const remove = (id) => {
    showConfirm({
      title: 'Удалить урок?', body: 'Урок будет удален из системы', danger: true, confirmText: 'Удалить',
      onConfirm: async () => {
        try { await api.delete(`/api/training/${id}`); showToast('Удалено', 'success'); load(); } catch {}
      },
    });
  };

  const showCreate = () => {
    showForm({
      title: 'Новый урок',
      fields: [
        { name: 'title', label: 'Название', type: 'text', required: true, placeholder: 'Как печатать баннер' },
        { name: 'description', label: 'Описание и цель урока', type: 'textarea', required: true, placeholder: 'Что изучаем и для чего...' },
        { name: 'youtube_url', label: 'Ссылка YouTube (необязательно)', type: 'text', placeholder: 'https://youtube.com/watch?v=...' },
        { name: 'photo_url', label: 'Ссылка на фото (необязательно)', type: 'text', placeholder: 'https://.../image.jpg' },
        { name: 'photo_file', label: 'Фото с компьютера (необязательно)', type: 'file', accept: 'image/*' },
        { name: 'role_target', label: 'Для роли (необязательно)', type: 'select', options: [
          { value: '', label: 'Для всех' },
          { value: 'designer', label: 'Дизайнер' },
          { value: 'master', label: 'Мастер' },
          { value: 'assistant', label: 'Помощник' },
          { value: 'manager', label: 'Менеджер' },
        ]},
      ],
      submitText: 'Опубликовать',
      onSubmit: async (data) => {
        const hasYoutube = typeof data.youtube_url === 'string' && data.youtube_url.trim().length > 0;
        const hasPhotoUrl = typeof data.photo_url === 'string' && data.photo_url.trim().length > 0;
        const hasPhotoFile = data.photo_file && typeof data.photo_file === 'object' && data.photo_file.size > 0;
        if (!hasYoutube && !hasPhotoUrl && !hasPhotoFile) { showToast('Добавьте YouTube, ссылку на фото или загрузите фото', 'warning'); return; }
        if (hasYoutube && !data.youtube_url.includes('youtu')) { showToast('Проверьте ссылку на YouTube', 'warning'); return; }
        try {
          const created = await api.post('/api/training', {
            title: data.title, description: data.description,
            youtube_url: hasYoutube ? data.youtube_url.trim() : '',
            photo_url: hasPhotoUrl ? data.photo_url.trim() : null,
            role_target: data.role_target || null, is_required: false,
          });
          if (hasPhotoFile && created?.id) {
            await api.upload(`/api/training/${created.id}/photo`, data.photo_file);
          }
          showToast('Урок опубликован', 'success'); load();
        } catch {}
      },
    });
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Уроки</h1>
        {canManage && <button className="btn btn-primary btn-sm" onClick={showCreate}>+ Урок</button>}
      </div>
      <div className="px-4 space-y-4 pb-8 slide-up">
        {error ? <div style={{ textAlign: 'center', color: 'var(--danger)', padding: 32 }}>Ошибка загрузки</div>
          : items === null ? <div className="flex justify-center py-8"><div className="spinner"></div></div>
          : items.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎓</div>
              <p style={{ fontWeight: 600 }}>Нет уроков</p>
              <p style={{ fontSize: 13, marginTop: 4 }}>Добавьте YouTube и/или фото с описанием</p>
            </div>
          )
          : items.map(item => {
            const ytId = getYouTubeId(item.youtube_url);
            const ytThumb = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : '';
            const photo = item.photo_file ? buildUploadUrl(item.photo_file) : (item.photo_url || '');
            return (
              <div key={item.id} className="video-card card-hover">
                {ytThumb && (
                  <a href={item.youtube_url} target="_blank" rel="noopener" style={{ display: 'block', position: 'relative' }}>
                    <img src={ytThumb} alt={item.title} className="video-thumb" loading="lazy" />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="#dc2626"><path d="M8 5v14l11-7z" /></svg>
                      </div>
                    </div>
                  </a>
                )}
                {photo && (
                  <a href={photo} target="_blank" rel="noopener" style={{ display: 'block', borderTop: '1px solid var(--border)' }}>
                    <img src={photo} alt={`Фото к уроку ${item.title}`} className="video-thumb" loading="lazy" style={{ objectFit: 'cover' }} />
                  </a>
                )}
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <h3 style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{item.title}</h3>
                      {item.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{item.description}</p>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {item.youtube_url && <span className="badge" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>YouTube</span>}
                        {photo && <span className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>Фото</span>}
                        {item.role_target && <span className="badge" style={{ background: 'var(--purple-light)', color: 'var(--purple)' }}>Для: {roleLabel(item.role_target, lang)}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button className={`btn btn-sm ${item.watched ? 'btn-success' : 'btn-secondary'}`} onClick={() => watch(item.id)}>
                        {item.watched ? '✅' : '👁'}
                      </button>
                      {canManage && <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => remove(item.id)}>✕</button>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
}
