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

## Эндпоинты

Все эндпоинты 1:1 повторяют API оригинального FastAPI-бэкенда tamga.

- **Auth**: `/api/auth/login`, `/me`, `/change-password`
- **Users**: `/api/users` CRUD, `/me`, `/me/lang`, `/:id/active`, `/:id/reset-password`
- **Pricelist**: `/api/pricelist` (GET/PUT)
- **Inventory**: `/api/inventory`, `/alerts`, `/:id/ledger`, `/:id/receive`, `/:id/correction`
- **Orders**: `/api/orders` (list/create), `/:id` (get/put), `/:id/status`, `/:id/notify`, `/:id/photo`, `/:id/design`, `/:id/photo/raw`
- **HR**: `/api/hr/checkin`, `/checkout`, `/my-attendance`, `/attendance`, `/attendance/today`, `/shift-tasks` (catalog/CRUD/complete/report), `/incidents` (CRUD/photo/review)
- **Payroll**: `/api/payroll`, `/month-report`, `/week-report`, `/:id/pay`
- **Tasks**: `/api/tasks` CRUD, `/:id/done`
- **Training**: `/api/training` CRUD, `/:id/watch`, `/:id/photo`, `/progress`
- **Leave requests**: `/api/leave-requests` (list/create), `/:id/status`
- **Announcements**: `/api/announcements` (list/create), `/:id/read`
- **Reports**: `/api/reports/orders-summary`, `/material-usage`, `/employee-stats`, `/finance`, `/finance-export.csv`
- **Work journal**: `/api/work-journal`
- **Real-time**: `/api/events` (Server-Sent Events, авторизация через `?token=...`)
- **Uploads**: `/api/uploads/:filename` — отдача файлов из БД

## Real-time события

Сервер пушит эти события всем подключённым клиентам (или конкретному пользователю через `broadcastTo`):

- `orders:changed` — создание/изменение/смена статуса заказа
- `hr:attendance` — приход/уход на смене
- `hr:incident` — новый инцидент
- `tasks:changed` — задача создана / отмечена выполненной
- `leave:changed` — заявка создана / одобрена / отклонена
- `inventory:changed` — приход или корректировка материала
- `payroll:paid` — зарплата выплачена (только этому юзеру)
- `announcement:new` — новое объявление

## Деплой на Railway

1. Создай новый сервис из репо `tamga-ehnanced`, **Root Directory** = `server`.
2. Подключи Postgres-плагин — он автоматически прокинет `DATABASE_URL`.
3. Выстави env: `SECRET_KEY=<random>`, `CORS_ORIGINS=https://<frontend>.up.railway.app`.
4. Build: `npm install`, Start: `npm start`.
5. URL бэкенда добавь во фронт-сервис как `VITE_API_BASE`.
