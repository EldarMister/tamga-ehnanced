# tamga-server

Node.js + Express + Postgres backend для tamga-react.

## Стек

- express, pg, cors, dotenv — всё. Без ORM, без bcrypt, без jsonwebtoken (auth/JWT через встроенный `crypto`).

## Запуск локально

### Unified (один процесс отдаёт и фронт, и API)
Из корня репо:
```
npm install
npm run build           # собирает dist/ и ставит prod-deps бэка
npm start               # запускает node server/index.js на :8000
```
Открыть http://localhost:8000 — там и фронт, и API.

### Раздельно (для разработки фронта с горячей перезагрузкой)
```
npm install                             # фронт-deps в корне
npm --prefix server install             # бэк-deps в server/
cp server/.env.example server/.env      # задать DATABASE_URL
```
Затем в двух терминалах:
```
npm run dev:server     # бэк на :8000 с node --watch
npm run dev            # фронт на :5173 с прокси /api → :8000
```
Подними Postgres локально: `docker run -p 5432:5432 -e POSTGRES_PASSWORD=pass postgres:16`.

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

## Деплой на Railway (unified, один сервис)

Фронт и бэк живут в одном Railway-сервисе: бэк отдаёт собранный `dist/` как статику + SPA-fallback, плюс свой `/api/*`.

1. Создай **один** сервис из репо `tamga-ehnanced`. **Root Directory** не трогай (корень репо).
2. Добавь Postgres-плагин — он автоматически пробросит `DATABASE_URL`.
3. Выстави env (`SECRET_KEY` обязательно):
   ```
   SECRET_KEY=<случайная строка>
   ```
   `VITE_API_BASE` и `CORS_ORIGINS` не нужны — same-origin.
4. Railway сам подхватит `package.json` корня:
   - **Build**: `npm install && npm run build` (билдит фронт + ставит prod-deps бэка)
   - **Start**: `npm start` (запускает `node server/index.js`)
5. Открываешь URL → логин `admin / 12345` → меняй пароль директора в Профиле.
