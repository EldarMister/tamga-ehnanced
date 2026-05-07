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

// Услуги (прайс-лист). Колонки: code, name_ru, name_ky, category, unit,
// price_retail, price_dealer, cost_price, min_order, options.
const SERVICES_SEED = [
  ['banner',   'Баннер',                'Баннер',                'banner',        'м²',   450,  300, 150, 1, '{"lyuvers": {"label": "Люверсы (кольца)", "price": 50}}'],
  ['vinyl',    'Самоклейка',            'Өзү жабышчаак',         'vinyl',         'м²',   600,  400, 200, 1, '{}'],
  ['mesh',     'Сеточная самоклейка',   'Тор өзү жабышчаак',     'mesh',          'м²',   700,  500, 250, 1, '{}'],
  ['table',    'Таблички (ПВХ)',        'Табличкалар (ПВХ)',     'table',         'шт',   350,  0,   100, 1, '{}'],
  ['forex',    'Стенды Forex',          'Forex стенддери',       'stand',         'м²',   2000, 1800, 800, 1, '{}'],
  ['letters',  'Объемные буквы',        'Көлөмдүү тамгалар',     'letters',       'см',   50,   0,   15,  1, '{"calc_by": "height"}'],
  ['plotter',  'Плоттерная резка',      'Плоттердик кесүү',      'plotter',       'м²',   1000, 0,   300, 1, '{}'],
  ['dtf',      'DTF печать',            'DTF басып чыгаруу',     'dtf',           'шт',   350,  0,   100, 1, '{"artyna_price": 150}'],
  ['menu_a4',  'Меню A4',               'Меню A4',               'menu',          'лист', 150,  0,   50,  5, '{"double_lam": 200}'],
  ['vizit_1',  'Визитки 1 стор.',       'Визитка 1 тарап',       'business_card', 'шт',   5,    0,   1,   20, '{}'],
  ['vizit_2',  'Визитки 2 стор.',       'Визитка 2 тарап',       'business_card', 'шт',   6,    0,   2,   20, '{}'],
  ['photo_a4', 'Фото A4',               'Сүрөт A4',              'photo',         'шт',   50,   0,   15,  1, '{}'],
  ['photo_a3', 'Фото A3',               'Сүрөт A3',              'photo',         'шт',   150,  0,   40,  1, '{}'],
];

// Материалы склада. Колонки: code, name_ru, name_ky, unit, quantity, low_threshold, roll_size.
const MATERIALS_SEED = [
  ['banner_roll', 'Баннерная ткань',    'Баннер кездеме',         'м²', 0, 10, 50],
  ['vinyl_roll',  'Самоклейка',         'Өзү жабышчаак',          'м²', 0, 10, 50],
  ['mesh_roll',   'Сеточная самоклейка','Тор өзү жабышчаак',      'м²', 0, 10, 50],
  ['oracal_roll', 'Плоттерная пленка',  'Плоттер пленкасы',       'м²', 0, 5,  25],
  ['dtf_film',    'DTF пленка',         'DTF пленка',             'м²', 0, 5,  100],
];

// Связь услуга → материал → коэффициент расхода
const SERVICE_MATERIAL_MAP_SEED = [
  ['banner',  'banner_roll', 1.0],
  ['vinyl',   'vinyl_roll',  1.0],
  ['mesh',    'mesh_roll',   1.0],
  ['plotter', 'oracal_roll', 1.0],
  ['dtf',     'dtf_film',    0.09], // ~A4 ≈ 0.09 m²
];

export async function initDb() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  // pg.Pool.query поддерживает несколько statement'ов в одной строке.
  await pool.query(schema);
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS prepayment_amount REAL NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount REAL NOT NULL DEFAULT 0');
  await pool.query('UPDATE orders SET prepayment_amount = 0 WHERE prepayment_amount IS NULL');
  await pool.query('UPDATE orders SET discount_amount = 0 WHERE discount_amount IS NULL');

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

  // Сидим прайс-лист, если в services пусто.
  const sCount = await pool.query('SELECT COUNT(*)::int AS n FROM services');
  if (sCount.rows[0].n === 0) {
    for (const s of SERVICES_SEED) {
      await pool.query(
        `INSERT INTO services (code, name_ru, name_ky, category, unit, price_retail, price_dealer, cost_price, min_order, options)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        s,
      );
    }
    console.log(`[db] seeded ${SERVICES_SEED.length} services`);
  }

  // Сидим склад (материалы), если в materials пусто.
  const mCount = await pool.query('SELECT COUNT(*)::int AS n FROM materials');
  if (mCount.rows[0].n === 0) {
    for (const m of MATERIALS_SEED) {
      await pool.query(
        `INSERT INTO materials (code, name_ru, name_ky, unit, quantity, low_threshold, roll_size)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        m,
      );
    }
    console.log(`[db] seeded ${MATERIALS_SEED.length} materials`);
  }

  // Связи услуга↔материал. Идемпотентно: вставляем только пары, которых ещё нет.
  for (const [serviceCode, materialCode, ratio] of SERVICE_MATERIAL_MAP_SEED) {
    await pool.query(
      `INSERT INTO service_material_map (service_id, material_id, ratio)
       SELECT s.id, m.id, $1 FROM services s, materials m
       WHERE s.code = $2 AND m.code = $3
       ON CONFLICT (service_id, material_id) DO NOTHING`,
      [ratio, serviceCode, materialCode],
    );
  }
}
