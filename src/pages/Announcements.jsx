import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatDateTime, roleLabel } from '../lib/utils.js';

export default function Announcements() {
  const { user, lang } = useAuth();
  const showToast = useToast();
  const isDirector = user.role === 'director';
  const [users, setUsers] = useState([]);
  const [list, setList] = useState(null);
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('');

  const loadList = useCallback(async () => {
    try {
      const items = await api.get('/api/announcements');
      setList(items || []);
      (items || []).filter(a => !a.is_read).forEach(a => {
        api.post(`/api/announcements/${a.id}/read`, {}).catch(() => {});
      });
    } catch { setList([]); }
  }, []);

  useEffect(() => {
    if (isDirector) {
      api.get('/api/users').then(u => setUsers(u || [])).catch(() => {});
    }
    loadList();
  }, [isDirector, loadList]);

  const send = async () => {
    if (!message.trim()) { showToast('Введите сообщение', 'warning'); return; }
    try {
      await api.post('/api/announcements', {
        message: message.trim(),
        target_user_id: target ? parseInt(target) : null,
      });
      showToast('Объявление отправлено', 'success');
      setMessage(''); setTarget('');
      loadList();
    } catch {}
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Объявления</h1>
        <div></div>
      </div>
      <div className="px-4 space-y-4 pb-8">
        {isDirector && (
          <div className="card">
            <h3 className="font-bold mb-3 text-gray-700">Новое объявление</h3>
            <div className="space-y-3">
              <div>
                <label className="input-label">Кому</label>
                <select className="input" value={target} onChange={e => setTarget(e.target.value)}>
                  <option value="">Всем сотрудникам</option>
                  {users.filter(u => u.role !== 'director').map(u => (
                    <option key={u.id} value={u.id}>{u.full_name} ({roleLabel(u.role, lang)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label">Сообщение</label>
                <textarea className="input" rows={3} placeholder="Текст объявления..."
                          value={message} onChange={e => setMessage(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={send}>Отправить</button>
            </div>
          </div>
        )}
        <div>
          {list === null ? (
            <div className="flex justify-center py-8"><div className="spinner"></div></div>
          ) : list.length === 0 ? (
            <div className="text-center text-gray-400 py-8">Нет объявлений</div>
          ) : list.map(a => (
            <div key={a.id} className={`card mb-3 ${a.is_read ? '' : 'card-glow'}`}>
              <div className="flex items-center justify-between">
                <div className="font-bold">{a.created_by_name || 'Директор'}</div>
                <div className="text-xs text-gray-400">{formatDateTime(a.created_at, lang)}</div>
              </div>
              <div className="mt-2 text-gray-700">{a.message}</div>
              <div className="text-xs text-gray-400 mt-2">{a.target_user_id ? 'Личное сообщение' : 'Для всех'}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
