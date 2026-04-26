// Server-Sent Events hub. Все подключённые клиенты держат открытое HTTP-соединение,
// сервер пушит им события строкой `data: ...\n\n`. Никаких внешних либ.
import { decodeToken } from './auth.js';
import { one } from './db.js';

const clients = new Set();

function send(res, eventName, data) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data || {})}\n\n`);
}

export async function sseHandler(req, res) {
  // Авторизация через ?token=... (EventSource не умеет ставить Authorization-header).
  const token = req.query.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const data = token && decodeToken(token);
  if (!data) {
    res.status(401).end('unauthorized');
    return;
  }
  const user = await one('SELECT id, role FROM users WHERE id = ? AND is_active = 1', [data.sub]);
  if (!user) {
    res.status(401).end('unauthorized');
    return;
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // отключает буферизацию у nginx-проксей
  });
  res.flushHeaders?.();

  // Hello
  send(res, 'hello', { user_id: user.id, role: user.role, ts: Date.now() });

  const client = { res, user };
  clients.add(client);

  // Heartbeat каждые 25с — иначе прокси закрывают idle-соединение.
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 25000);

  const close = () => {
    clearInterval(ping);
    clients.delete(client);
    try { res.end(); } catch {}
  };
  req.on('close', close);
  req.on('error', close);
}

// Вещаем всем подписчикам событие `name` с payload'ом.
export function broadcast(name, payload = {}) {
  for (const c of clients) {
    try { send(c.res, name, payload); }
    catch { clients.delete(c); }
  }
}

// Вещаем только конкретному пользователю (по id).
export function broadcastTo(userId, name, payload = {}) {
  for (const c of clients) {
    if (c.user.id === userId) {
      try { send(c.res, name, payload); }
      catch { clients.delete(c); }
    }
  }
}
