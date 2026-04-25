import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Login() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const showToast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      showToast('Введите логин и пароль', 'warning');
      return;
    }
    setBusy(true);
    try {
      const data = await api.post('/api/auth/login', { username: username.trim(), password });
      if (data) {
        login(data.token, data.user);
        showToast(`Добро пожаловать, ${data.user.full_name}!`, 'success');
        navigate('/orders');
      }
    } catch {} finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-8 h-8">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Тамга Сервис</h1>
          <p className="text-gray-500 mt-1">Вход в систему</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="input-label">Логин</label>
            <input type="text" className="input" placeholder="Имя пользователя"
              autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="input-label">Пароль</label>
            <input type="password" className="input" placeholder="Пароль"
              autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
