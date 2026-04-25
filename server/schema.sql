-- Tamga schema for Postgres. 1:1 порт со схемы FastAPI/SQLite.

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    full_name     TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK(role IN ('director','manager','designer','master','assistant')),
    phone         TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    lang          TEXT    NOT NULL DEFAULT 'ru' CHECK(lang IN ('ru','ky')),
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
    id            SERIAL PRIMARY KEY,
    code          TEXT    NOT NULL UNIQUE,
    name_ru       TEXT    NOT NULL,
    name_ky       TEXT    NOT NULL,
    category      TEXT    NOT NULL,
    unit          TEXT    NOT NULL,
    price_retail  REAL    NOT NULL DEFAULT 0,
    price_dealer  REAL    NOT NULL DEFAULT 0,
    cost_price    REAL    NOT NULL DEFAULT 0,
    min_order     INTEGER NOT NULL DEFAULT 1,
    options       TEXT    NOT NULL DEFAULT '{}',
    is_active     INTEGER NOT NULL DEFAULT 1,
    updated_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_history (
    id            SERIAL PRIMARY KEY,
    service_id    INTEGER NOT NULL REFERENCES services(id),
    price_retail  REAL    NOT NULL,
    price_dealer  REAL    NOT NULL,
    changed_by    INTEGER NOT NULL REFERENCES users(id),
    changed_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS materials (
    id              SERIAL PRIMARY KEY,
    code            TEXT    NOT NULL UNIQUE,
    name_ru         TEXT    NOT NULL,
    name_ky         TEXT    NOT NULL,
    unit            TEXT    NOT NULL,
    quantity        REAL    NOT NULL DEFAULT 0,
    reserved        REAL    NOT NULL DEFAULT 0,
    low_threshold   REAL    NOT NULL DEFAULT 10,
    roll_size       REAL    NOT NULL DEFAULT 50,
    updated_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_material_map (
    service_id   INTEGER NOT NULL REFERENCES services(id),
    material_id  INTEGER NOT NULL REFERENCES materials(id),
    ratio        REAL    NOT NULL DEFAULT 1.0,
    PRIMARY KEY (service_id, material_id)
);

CREATE TABLE IF NOT EXISTS orders (
    id                  SERIAL PRIMARY KEY,
    order_number        TEXT    NOT NULL UNIQUE,
    client_name         TEXT    NOT NULL,
    client_phone        TEXT,
    client_type         TEXT    NOT NULL CHECK(client_type IN ('retail','dealer')),
    status              TEXT    NOT NULL DEFAULT 'created'
                        CHECK(status IN ('created','design','design_done','production','printed','postprocess','ready','closed','cancelled','defect')),
    total_price         REAL    NOT NULL DEFAULT 0,
    material_cost       REAL    NOT NULL DEFAULT 0,
    notes               TEXT,
    design_file         TEXT,
    photo_file          TEXT,
    photo_mime          TEXT,
    photo_blob          BYTEA,
    assigned_designer   INTEGER REFERENCES users(id),
    assigned_master     INTEGER REFERENCES users(id),
    assigned_assistant  INTEGER REFERENCES users(id),
    deadline            TEXT,
    created_by          INTEGER NOT NULL REFERENCES users(id),
    created_at          TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id              SERIAL PRIMARY KEY,
    order_id        INTEGER NOT NULL REFERENCES orders(id),
    service_id      INTEGER NOT NULL REFERENCES services(id),
    material_id     INTEGER REFERENCES materials(id),
    quantity        REAL    NOT NULL,
    width           REAL,
    height          REAL,
    unit_price      REAL    NOT NULL,
    total           REAL    NOT NULL,
    material_qty    REAL    NOT NULL DEFAULT 0,
    options         TEXT    NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS order_history (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders(id),
    old_status  TEXT,
    new_status  TEXT    NOT NULL,
    changed_by  INTEGER NOT NULL REFERENCES users(id),
    note        TEXT,
    created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS material_ledger (
    id            SERIAL PRIMARY KEY,
    material_id   INTEGER NOT NULL REFERENCES materials(id),
    order_id      INTEGER REFERENCES orders(id),
    action        TEXT    NOT NULL CHECK(action IN ('receive','reserve','unreserve','consume','correction','defect')),
    quantity      REAL    NOT NULL,
    note          TEXT,
    performed_by  INTEGER NOT NULL REFERENCES users(id),
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    date        TEXT    NOT NULL DEFAULT CURRENT_DATE,
    check_in    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    check_out   TEXT,
    UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS incidents (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    type          TEXT    NOT NULL CHECK(type IN ('defect','late','complaint','other')),
    description   TEXT    NOT NULL,
    photo         TEXT,
    order_id      INTEGER REFERENCES orders(id),
    material_waste REAL,
    deduction_amount REAL,
    status        TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed')),
    created_by    INTEGER NOT NULL REFERENCES users(id),
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    week_start  TEXT    NOT NULL,
    week_end    TEXT    NOT NULL,
    base_salary REAL    NOT NULL DEFAULT 0,
    bonus       REAL    NOT NULL DEFAULT 0,
    deductions  REAL    NOT NULL DEFAULT 0,
    total       REAL    NOT NULL DEFAULT 0,
    is_paid     INTEGER NOT NULL DEFAULT 0,
    paid_at     TEXT,
    note        TEXT,
    created_by  INTEGER NOT NULL REFERENCES users(id),
    created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, week_start)
);

CREATE TABLE IF NOT EXISTS tasks (
    id            SERIAL PRIMARY KEY,
    title         TEXT    NOT NULL,
    description   TEXT,
    type          TEXT    NOT NULL DEFAULT 'daily' CHECK(type IN ('daily','weekly')),
    assigned_to   INTEGER NOT NULL REFERENCES users(id),
    assigned_by   INTEGER NOT NULL REFERENCES users(id),
    due_date      TEXT,
    is_done       INTEGER NOT NULL DEFAULT 0,
    done_at       TEXT,
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    type          TEXT    NOT NULL CHECK(type IN ('sick','rest')),
    reason        TEXT    NOT NULL,
    date_start    TEXT    NOT NULL,
    date_end      TEXT    NOT NULL,
    days_count    INTEGER NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_by    INTEGER NOT NULL REFERENCES users(id),
    reviewed_by   INTEGER REFERENCES users(id),
    reviewed_at   TEXT,
    review_note   TEXT,
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training (
    id            SERIAL PRIMARY KEY,
    title         TEXT    NOT NULL,
    description   TEXT,
    youtube_url   TEXT    NOT NULL,
    photo_url     TEXT,
    photo_file    TEXT,
    role_target   TEXT,
    assigned_to   INTEGER REFERENCES users(id),
    created_by    INTEGER NOT NULL REFERENCES users(id),
    is_required   INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_progress (
    id            SERIAL PRIMARY KEY,
    training_id   INTEGER NOT NULL REFERENCES training(id),
    user_id       INTEGER NOT NULL REFERENCES users(id),
    watched       INTEGER NOT NULL DEFAULT 0,
    watched_at    TEXT,
    UNIQUE(training_id, user_id)
);

CREATE TABLE IF NOT EXISTS shift_tasks (
    id            SERIAL PRIMARY KEY,
    role          TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    is_required   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS shift_task_logs (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    task_id       INTEGER NOT NULL REFERENCES shift_tasks(id),
    date          TEXT    NOT NULL DEFAULT CURRENT_DATE,
    completed     INTEGER NOT NULL DEFAULT 1,
    UNIQUE(user_id, task_id, date)
);

CREATE TABLE IF NOT EXISTS announcements (
    id            SERIAL PRIMARY KEY,
    message       TEXT    NOT NULL,
    target_user_id INTEGER REFERENCES users(id),
    created_by    INTEGER NOT NULL REFERENCES users(id),
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcement_reads (
    id            SERIAL PRIMARY KEY,
    announcement_id INTEGER NOT NULL REFERENCES announcements(id),
    user_id       INTEGER NOT NULL REFERENCES users(id),
    read_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(announcement_id, user_id)
);

-- Хранилище загруженных файлов (фото заказов/инцидентов/уроков, дизайны).
-- Railway-FS эфемерна, поэтому байты лежат прямо в БД.
CREATE TABLE IF NOT EXISTS uploads (
    filename    TEXT    PRIMARY KEY,
    mime        TEXT    NOT NULL DEFAULT 'application/octet-stream',
    data        BYTEA   NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_notifications (
    id            SERIAL PRIMARY KEY,
    order_id      INTEGER NOT NULL REFERENCES orders(id),
    channel       TEXT    NOT NULL,
    message       TEXT    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'queued',
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_designer ON orders(assigned_designer);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_master ON orders(assigned_master);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON order_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_changed_by ON order_history(changed_by, created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date_user ON attendance(date, user_id);
CREATE INDEX IF NOT EXISTS idx_incidents_user_created ON incidents(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_material_ledger_material ON material_ledger(material_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shift_task_logs_user_date ON shift_task_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_dates ON leave_requests(user_id, date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status_dates ON leave_requests(status, date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_leave_requests_created_at ON leave_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_done_at_assigned ON tasks(done_at, assigned_to);
