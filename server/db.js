import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('[db] DATABASE_URL не задан');
  process.exit(1);
}

const ssl = process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false };
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 10 });

// Хелпер: pg использует $1,$2,... — а нам удобно писать ?,?,... как в FastAPI.
function qmarkToPg(sql) {
  let i = 0, inSingle = false, out = '';
  for (let k = 0; k < sql.length; k++) {
    const ch = sql[k];
    if (ch === "'") {
      if (inSingle && sql[k + 1] === "'") { out += "''"; k++; continue; }
      inSingle = !inSingle;
      out += ch;
    } else if (ch === '?' && !inSingle) {
      out += '$' + (++i);
    } else {
      out += ch;
    }
  }
  return out;
}

export async function query(sql, params = []) {
  const text = qmarkToPg(sql);
  const result = await pool.query(text, params);
  return result;
}

export async function one(sql, params = []) {
  const r = await query(sql, params);
  return r.rows[0] || null;
}

export async function all(sql, params = []) {
  const r = await query(sql, params);
  return r.rows;
}

export async function exec(sql, params = []) {
  const r = await query(sql, params);
  return { rowCount: r.rowCount, rows: r.rows };
}

const SHIFT_TASK_SEED = [
  ['master', 'Выключил оборудование', 1],
  ['master', 'Убрал рабочее место', 1],
  ['master', 'Сложил материалы', 1],
  ['master', 'Проверил печать', 1],
  ['designer', 'Сохранил файлы', 1],
  ['designer', 'Передал макеты', 1],
  ['designer', 'Закрыл задачи', 1],
  ['manager', 'Проверил заказы', 1],
  ['manager', 'Уведомил клиентов', 1],
  ['manager', 'Закрыл смену', 1],
];

export async function initDb() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  // pg.Pool.query поддерживает несколько statement'ов в одной строке.
  await pool.query(schema);

  // Сидим shift_tasks один раз
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM shift_tasks');
  if (rows[0].n === 0) {
    for (const [role, title, req] of SHIFT_TASK_SEED) {
      await pool.query('INSERT INTO shift_tasks (role, title, is_required) VALUES ($1, $2, $3)', [role, title, req]);
    }
    console.log('[db] seeded shift_tasks');
  }

  // Сидим первого директора, если ни одного пользователя нет
  const u = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  if (u.rows[0].n === 0) {
    await pool.query(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4)',
      ['admin', hashPassword('12345'), 'Директор', 'director'],
    );
    console.log('[db] создан admin / 12345 (поменяй пароль после первого входа)');
  }
}
