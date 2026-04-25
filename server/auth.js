import crypto from 'crypto';

const SECRET = process.env.SECRET_KEY || 'change-me';
const EXPIRY_HOURS = Number(process.env.JWT_EXPIRY_HOURS || 720);

// 1:1 совместимо со схемой из FastAPI: sha256(password + SECRET_KEY) hex.
export function hashPassword(password) {
  return crypto.createHash('sha256').update(password + SECRET).digest('hex');
}

export function verifyPassword(password, hashed) {
  const a = Buffer.from(hashPassword(password), 'utf8');
  const b = Buffer.from(hashed || '', 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

export function createToken(userId, role) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    sub: userId, role, iat: now, exp: now + EXPIRY_HOURS * 3600,
  }));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

export function decodeToken(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expected = b64url(crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest());
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(b64urlDecode(payload).toString('utf8'));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

// Express middleware: достаёт пользователя из БД по токену.
// Импорт db.js делаем лениво, чтобы тесты-обёртки могли подгрузить auth без БД.
export async function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const data = token && decodeToken(token);
  if (!data) return res.status(401).json({ detail: 'Не авторизован' });
  const { one } = await import('./db.js');
  const user = await one('SELECT * FROM users WHERE id = ? AND is_active = 1', [data.sub]);
  if (!user) return res.status(401).json({ detail: 'Пользователь не найден или деактивирован' });
  req.user = user;
  next();
}

export function roleRequired(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ detail: 'Не авторизован' });
    if (!allowed.includes(req.user.role)) return res.status(403).json({ detail: 'Нет доступа' });
    next();
  };
}
