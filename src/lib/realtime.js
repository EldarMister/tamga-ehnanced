// SSE-клиент. Один EventSource на всё приложение, события рассылаются
// через простой pub/sub. Авто-переподключение с backoff'ом.
import { apiUrl } from './api.js';
import { getToken } from './auth.jsx';

const listeners = new Map(); // event -> Set<fn>
let source = null;
let reconnectTimer = null;
let backoff = 1000;
const MAX_BACKOFF = 30000;

function url() {
  const token = getToken();
  if (!token) return null;
  // EventSource не поддерживает заголовки — токен в query.
  return `${apiUrl('/api/events')}?token=${encodeURIComponent(token)}`;
}

function fire(name, data) {
  const set = listeners.get(name);
  if (!set) return;
  for (const fn of set) {
    try { fn(data); } catch (e) { console.error('[realtime]', name, e); }
  }
}

function connect() {
  const u = url();
  if (!u) return;
  if (source) { try { source.close(); } catch {} }

  source = new EventSource(u);

  source.addEventListener('open', () => { backoff = 1000; });
  source.addEventListener('hello', (e) => fire('hello', JSON.parse(e.data || '{}')));

  // Все остальные именованные события: пропускаем как есть.
  ['orders:changed','hr:attendance','hr:incident','tasks:changed',
   'leave:changed','inventory:changed','payroll:paid','announcement:new']
    .forEach(name => source.addEventListener(name, (e) => fire(name, JSON.parse(e.data || '{}'))));

  source.addEventListener('error', () => {
    try { source.close(); } catch {}
    source = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      connect();
    }, backoff);
  });
}

export function startRealtime() {
  if (typeof EventSource === 'undefined') return;
  connect();
}

export function stopRealtime() {
  if (source) { try { source.close(); } catch {} source = null; }
  clearTimeout(reconnectTimer);
}

// Подписка. Возвращает unsubscribe.
export function on(event, fn) {
  let set = listeners.get(event);
  if (!set) { set = new Set(); listeners.set(event, set); }
  set.add(fn);
  return () => set.delete(fn);
}
