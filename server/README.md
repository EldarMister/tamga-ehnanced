# tamga-server

Node.js + Express + Postgres backend для tamga-react.

## Стек

- express, pg, cors, dotenv — всё. Без ORM, без bcrypt, без jsonwebtoken (auth/JWT через встроенный `crypto`).

## Запуск локально

1. Подними Postgres (`docker run -p 5432:5432 -e POSTGRES_PASSWORD=pass postgres:16`).
2. `cp .env.example .env` и пропиши `DATABASE_URL`.
3. `npm install`
4. `npm run dev` (с `--watch`) или `npm start`.

При первом запуске:
- создаются все таблицы из `schema.sql`,
- сидятся `shift_tasks`,
- создаётся первый директор: **admin / 12345** (если в `users` пусто).

## Эндпоинты (этап 1+2)

### Auth
- `POST /api/auth/login` — `{username, password}` → `{token, user}`
- `GET /api/auth/me` — текущий пользователь (Bearer)
- `POST /api/auth/change-password` — `{old_password, new_password}`

### Users
- `GET /api/users` — список (director/manager)
- `POST /api/users` — создание (director)
- `PUT /api/users/:id` — обновление (director)
- `PATCH /api/users/:id/active` — toggle активности (director)
- `POST /api/users/:id/reset-password` — сброс на 12345 (director)
- `PATCH /api/users/me/lang?lang=ru|ky` — смена языка
- `PATCH /api/users/me` — смена логина/телефона (director)

## Деплой на Railway

1. Создай новый сервис из репо `tamga-ehnanced`, **Root Directory** = `server`.
2. Подключи Postgres-плагин — он автоматически прокинет `DATABASE_URL`.
3. Выстави env: `SECRET_KEY=<random>`, `CORS_ORIGINS=https://<frontend>.up.railway.app`.
4. Build: `npm install`, Start: `npm start`.
5. URL бэкенда добавь во фронт-сервис как `VITE_API_BASE`.
