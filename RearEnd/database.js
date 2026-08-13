/**
 * SQLite 数据库初始化和操作模块
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(__dirname, process.env.DB_PATH)
  : path.join(__dirname, 'furry_hotel.db');

// 确保数据库目录存在
const fs = require('fs');
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);

// 启用 WAL 模式提升并发性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- 建表 ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    nickname    TEXT    NOT NULL DEFAULT '',
    phone       TEXT    NOT NULL DEFAULT '',
    avatar      TEXT    NOT NULL DEFAULT '',
    role        TEXT    NOT NULL DEFAULT 'guest',
    real_name   TEXT    NOT NULL DEFAULT '',
    id_card     TEXT    NOT NULL DEFAULT '',
    status      TEXT    NOT NULL DEFAULT 'active',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    room_number TEXT    NOT NULL UNIQUE,
    room_type   TEXT    NOT NULL DEFAULT 'standard',
    floor       INTEGER NOT NULL DEFAULT 1,
    price       REAL    NOT NULL DEFAULT 0,
    status      TEXT    NOT NULL DEFAULT 'available',
    description TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS guests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER,
    name        TEXT    NOT NULL,
    phone       TEXT    NOT NULL DEFAULT '',
    id_card     TEXT    NOT NULL DEFAULT '',
    room_id     INTEGER,
    check_in    TEXT,
    check_out   TEXT,
    status      TEXT    NOT NULL DEFAULT 'checked_in',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    guest_name    TEXT    NOT NULL,
    guest_phone   TEXT    NOT NULL DEFAULT '',
    room_id       INTEGER,
    total_price   REAL    NOT NULL DEFAULT 0,
    status        TEXT    NOT NULL DEFAULT 'pending',
    remark        TEXT    NOT NULL DEFAULT '',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  );

  CREATE TABLE IF NOT EXISTS verifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER,
    verified_by INTEGER,
    result      TEXT    NOT NULL DEFAULT 'success',
    note        TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (verified_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS room_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    label       TEXT    NOT NULL DEFAULT '',
    base_price  REAL    NOT NULL DEFAULT 0,
    description TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS order_guests (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id  INTEGER NOT NULL,
    user_id   INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS deposits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER,
    user_id     INTEGER NOT NULL,
    room_id     INTEGER,
    amount      REAL    NOT NULL DEFAULT 0,
    status      TEXT    NOT NULL DEFAULT 'collected',
    remark      TEXT    NOT NULL DEFAULT '',
    operator_id INTEGER,
    paid_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    resolved_at TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  );

  CREATE TABLE IF NOT EXISTS staff_deposits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    amount      REAL    NOT NULL DEFAULT 0,
    status      TEXT    NOT NULL DEFAULT 'collected',
    remark      TEXT    NOT NULL DEFAULT '',
    operator_id INTEGER,
    paid_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    resolved_at TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (operator_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_room_id ON orders(room_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_guests_user_id ON guests(user_id);
  CREATE INDEX IF NOT EXISTS idx_guests_room_id ON guests(room_id);
  CREATE INDEX IF NOT EXISTS idx_deposits_order_id ON deposits(order_id);
  CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits(user_id);
  CREATE INDEX IF NOT EXISTS idx_order_guests_order_id ON order_guests(order_id);
  CREATE INDEX IF NOT EXISTS idx_staff_deposits_user_id ON staff_deposits(user_id);
`);

// ---------- 新增 hotel_room_types 表 ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS hotel_room_types (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL UNIQUE,
    label           TEXT    NOT NULL DEFAULT '',
    base_price      REAL    NOT NULL DEFAULT 0,
    description     TEXT    NOT NULL DEFAULT '',
    default_deposit REAL    NOT NULL DEFAULT 0,
    capacity        INTEGER NOT NULL DEFAULT 2,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// ---------- 迁移：为 room_types 表补充 is_room_package, hotel_room_type, stock 列 ----------
const rtColsNew = db.prepare("PRAGMA table_info(room_types)").all().map(c => c.name);
if (!rtColsNew.includes('is_room_package')) {
  db.exec("ALTER TABLE room_types ADD COLUMN is_room_package INTEGER NOT NULL DEFAULT 0");
}
if (!rtColsNew.includes('hotel_room_type')) {
  db.exec("ALTER TABLE room_types ADD COLUMN hotel_room_type TEXT DEFAULT NULL");
}
if (!rtColsNew.includes('stock')) {
  db.exec("ALTER TABLE room_types ADD COLUMN stock INTEGER NOT NULL DEFAULT 100");
}
if (!rtColsNew.includes('default_deposit')) {
  db.exec("ALTER TABLE room_types ADD COLUMN default_deposit REAL NOT NULL DEFAULT 0");
}

// ---------- 迁移：为 orders 表补充 guests 列 ----------
const orderColsNew = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
if (!orderColsNew.includes('guests')) {
  db.exec("ALTER TABLE orders ADD COLUMN guests INTEGER NOT NULL DEFAULT 1");
}
if (!orderColsNew.includes('room_type')) {
  db.exec("ALTER TABLE orders ADD COLUMN room_type TEXT NOT NULL DEFAULT ''");
}
if (!orderColsNew.includes('reject_reason')) {
  db.exec("ALTER TABLE orders ADD COLUMN reject_reason TEXT NOT NULL DEFAULT ''");
}

// ---------- 新增 system_settings 表 ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS system_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);
// 插入默认设置：预定开关默认关闭
db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('booking_open', '0')").run();
// 插入默认设置：会话超时时间（分钟），默认480分钟（8小时）
db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('session_timeout_minutes', '480')").run();
// 插入默认设置：网站信息
db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('site_title', 'FurryEvent 电子售票核销系统')").run();
db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('site_subtitle', '大型狂欢沙龙活动，欢迎购票参加')").run();
db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('copyright_text', '© 2026 FurryEvent')").run();
// 插入默认设置：注册模式（open/closed/review/invite）
db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('registration_mode', 'open')").run();
// 插入默认设置：单人购票上限限制，默认1张
db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('max_tickets_per_user', '1')").run();

// ---------- 迁移：为已有 guests 表补充 user_id 列 ----------
const guestCols = db.prepare("PRAGMA table_info(guests)").all().map(c => c.name);
if (!guestCols.includes('user_id')) {
  db.exec("ALTER TABLE guests ADD COLUMN user_id INTEGER REFERENCES users(id)");
}

// ---------- 迁移：为 users 表补充 status 列 ----------
const userCols2 = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols2.includes('status')) {
  db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}

// ---------- 迁移已经完成的阶段 ----------

// ---------- 迁移已经完成的阶段，票档预填充已经整合到 database_seeded 检测下 ----------

// ---------- 新增 invite_codes 表 ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS invite_codes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT    NOT NULL UNIQUE,
    created_by  INTEGER,
    max_uses    INTEGER NOT NULL DEFAULT 1,
    use_count   INTEGER NOT NULL DEFAULT 0,
    expires_at  TEXT,
    status      TEXT    NOT NULL DEFAULT 'active',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// ---------- 插入默认管理员和示例数据 ----------
const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!admin) {
  const bcrypt = require('bcryptjs');
  const crypto = require('crypto');
  // 随机生成管理员初始密码
  const initialPassword = crypto.randomBytes(8).toString('hex');
  const hash = bcrypt.hashSync(initialPassword, 10);
  db.prepare(`INSERT INTO users (username, password, nickname, role)
    VALUES ('admin', ?, '管理员', 'admin')`).run(hash);

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  默认管理员账号已创建                      ║');
  console.log(`║  用户名: admin                            ║`);
  console.log(`║  密码:   ${initialPassword}                ║`);
  console.log('║  ⚠️  请登录后立即修改密码！                ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
}

// ---------- 预填充所有数据库初始数据（仅运行一次） ----------
const databaseSeeded = db.prepare("SELECT value FROM system_settings WHERE key = 'database_seeded'").get();
  if (!databaseSeeded || databaseSeeded.value !== '1') {
    console.log('[INFO] Seeding database preset data...');
    
    // 1. 预填充房型到 hotel_room_types
    const insertHotelType = db.prepare('INSERT OR IGNORE INTO hotel_room_types (name, label, base_price, description, default_deposit, capacity) VALUES (?, ?, ?, ?, ?, ?)');
    insertHotelType.run('room_standard', '标准大床房', 388, '舒适单人/双人大床，含单人自助早餐', 100, 2);
    insertHotelType.run('room_deluxe', '豪华双人房', 588, '宽敞双床房，含双人自助早餐', 200, 4);

    // 2. 预填充票务套餐到 room_types
    db.exec("UPDATE room_types SET is_room_package = 0 WHERE name IN ('standard', 'deluxe', 'suite')");
    const insertType = db.prepare('INSERT OR IGNORE INTO room_types (name, label, base_price, description, is_room_package, hotel_room_type, stock) VALUES (?, ?, ?, ?, ?, ?, ?)');
    insertType.run('standard', '单日票', 288, '单日入场门票，普通席', 0, null, 100);
    insertType.run('deluxe', '双日票', 488, '双日入场门票，普通席（赠送纪念明信片）', 0, null, 50);
    insertType.run('suite', 'VIP通票', 888, 'VIP全通票，专属前排座位（赠送大礼包+周边）', 0, null, 20);
    insertType.run('pkg_standard', '单日票+标准房套餐', 588, '单日门票1张 + 标准大床房住宿1晚', 1, 'room_standard', 0);
    insertType.run('pkg_deluxe', '双日票+豪华房套餐', 988, '双日门票2张 + 豪华双人房住宿1晚', 1, 'room_deluxe', 0);

    // 3. 票档数据预填充已删除

    // 4. 插入示例门票/席位
    const roomsList = [
      ['A101', 'standard', 1, 288, 'available', '普通席 A区101座 (单日票)'],
      ['A102', 'standard', 1, 288, 'available', '普通席 A区102座 (单日票)'],
      ['B201', 'deluxe', 2, 488, 'available', '普通席 B区201座 (双日票)'],
      ['B202', 'deluxe', 2, 488, 'available', '普通席 B区202座 (双日票)'],
      ['V301', 'suite', 3, 888, 'available', 'VIP席 V区301座 (VIP通票)'],
      ['V302', 'suite', 3, 888, 'available', 'VIP席 V区302座 (VIP通票)'],
      ['A103', 'standard', 1, 288, 'available', '普通席 A区103座 (单日票)'],
      ['B203', 'deluxe', 2, 488, 'available', '普通席 B区203座 (双日票)'],
    ];
    const insertRoom = db.prepare(`INSERT OR IGNORE INTO rooms (room_number, room_type, floor, price, status, description) VALUES (?,?,?,?,?,?)`);
    for (const r of roomsList) {
      insertRoom.run(...r);
    }

    // 5. 确保存在客房物理数据
    insertRoom.run('101', 'room_standard', 1, 388, 'available', '标准大床房 - 101号房');
    insertRoom.run('102', 'room_standard', 1, 388, 'available', '标准大床房 - 102号房');
    insertRoom.run('201', 'room_deluxe', 2, 588, 'available', '豪华双人房 - 201号房');
    insertRoom.run('202', 'room_deluxe', 2, 588, 'available', '豪华双人房 - 202号房');

    // 6. 标记为已预填充
    db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('database_seeded', '1')").run();
    console.log('[INFO] Database seeding completed.');
  }

// ---------- 字段白名单（防止 SQL 列名注入） ----------
const ALLOWED_FIELDS = {
  rooms: ['room_number', 'room_type', 'floor', 'price', 'status', 'description'],
  guests: ['name', 'phone', 'id_card', 'room_id', 'check_in', 'check_out', 'status', 'user_id'],
  orders: ['guest_name', 'guest_phone', 'room_id', 'total_price', 'status', 'remark', 'room_type', 'reject_reason', 'guests'],
  users: ['nickname', 'phone', 'role', 'real_name', 'id_card', 'avatar', 'status'],
  room_types: ['name', 'label', 'base_price', 'description', 'default_deposit', 'is_room_package', 'hotel_room_type', 'stock'],
  hotel_room_types: ['name', 'label', 'base_price', 'description', 'default_deposit', 'capacity'],
  deposits: ['status', 'remark', 'resolved_at'],
};

/**
 * 过滤字段，只保留白名单中的键
 */
function filterFields(table, fields) {
  const allowed = ALLOWED_FIELDS[table];
  if (!allowed) return {};
  const filtered = {};
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k) && v !== undefined) {
      filtered[k] = v;
    }
  }
  return filtered;
}

// ---------- 数据操作 ----------

/**
 * 根据用户名查找用户
 */
function findUserByUsername(username) {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username);
}

/**
 * 根据 ID 查找用户（不含密码）
 */
function findUserById(id) {
  const stmt = db.prepare('SELECT id, username, nickname, phone, avatar, role, real_name, id_card, status, created_at, updated_at FROM users WHERE id = ?');
  return stmt.get(id);
}

/**
 * 创建新用户
 * @returns {{ id: number }} 新用户ID
 */
function createUser({ username, password, nickname, phone, role }) {
  const stmt = db.prepare(`
    INSERT INTO users (username, password, nickname, phone, role)
    VALUES (@username, @password, @nickname, @phone, @role)
  `);
  const result = stmt.run({ username, password, nickname: nickname || '', phone: phone || '', role: role || 'guest' });
  return { id: result.lastInsertRowid };
}

/**
 * 更新用户最后登录时间
 */
function updateLoginTime(id) {
  const stmt = db.prepare(`UPDATE users SET updated_at = datetime('now','localtime') WHERE id = ?`);
  stmt.run(id);
}

// ---------- 管理后台操作 ----------

// -- 仪表盘统计 --
function getDashboardStats() {
  const roomCount = db.prepare('SELECT COUNT(*) as count FROM rooms').get();
  const availableRooms = db.prepare("SELECT COUNT(*) as count FROM rooms WHERE status='available'").get();
  const occupiedRooms = db.prepare("SELECT COUNT(*) as count FROM rooms WHERE status='occupied'").get();
  const guestCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE real_name != '' AND id_card != ''").get();
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get();
  const todayCheckIn = db.prepare("SELECT COUNT(*) as count FROM orders WHERE date(created_at) = date('now','localtime') AND status='pending'").get();
  const todayRevenue = db.prepare("SELECT COALESCE(SUM(total_price),0) as total FROM orders WHERE date(created_at) = date('now','localtime')").get();
  const pendingOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status='pending'").get();
  return {
    totalRooms: roomCount.count,
    availableRooms: availableRooms.count,
    occupiedRooms: occupiedRooms.count,
    totalGuests: guestCount.count,
    totalOrders: orderCount.count,
    todayCheckIn: todayCheckIn.count,
    todayRevenue: todayRevenue.total,
    pendingOrders: pendingOrders.count,
  };
}

// -- 房间管理 --
function getAllRooms() {
  return db.prepare(`
    SELECT r.id, r.room_number, r.room_type, r.floor, r.price, r.status, r.description,
           rt.label as room_type_label, rt.capacity,
           COALESCE(SUM(o.guests), 0) as current_occupants
    FROM rooms r
    LEFT JOIN hotel_room_types rt ON r.room_type = rt.name
    LEFT JOIN orders o ON o.room_id = r.id AND o.status IN ('approved', 'confirmed', 'checked_in', 'pending')
    GROUP BY r.id
    ORDER BY r.floor, r.room_number
  `).all();
}

function getRoomById(id) {
  return db.prepare(`
    SELECT r.*, rt.label as room_type_label, rt.capacity
    FROM rooms r
    LEFT JOIN hotel_room_types rt ON r.room_type = rt.name
    WHERE r.id = ?
  `).get(id);
}

function createRoom({ room_number, room_type, floor, price, description }) {
  const stmt = db.prepare(`INSERT INTO rooms (room_number, room_type, floor, price, description) VALUES (@rn, @rt, @fl, @pr, @ds)`);
  return stmt.run({ rn: room_number, rt: room_type, fl: floor, pr: price, ds: description || '' });
}

function updateRoom(id, fields) {
  const safe = filterFields('rooms', fields);
  const sets = [];
  const vals = {};
  for (const [k, v] of Object.entries(safe)) {
    sets.push(`${k} = @${k}`);
    vals[k] = v;
  }
  vals.id = id;
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now','localtime')");
  return db.prepare(`UPDATE rooms SET ${sets.join(', ')} WHERE id = @id`).run(vals);
}

function deleteRoom(id) {
  db.prepare('UPDATE guests SET room_id = NULL WHERE room_id = ?').run(id);
  db.prepare('UPDATE orders SET room_id = NULL WHERE room_id = ?').run(id);
  return db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
}

// -- 客人管理 --
function getAllGuests() {
  return db.prepare(`
    SELECT g.id, g.user_id, g.room_id, g.check_in, g.check_out, g.status, g.created_at, g.updated_at,
           r.room_number, r.room_type,
           u.username, u.nickname as user_nickname,
           COALESCE(NULLIF(u.real_name, ''), g.name) as name,
           COALESCE(NULLIF(u.phone, ''), g.phone) as phone,
           COALESCE(NULLIF(u.id_card, ''), g.id_card) as id_card,
           COALESCE(
             (
               SELECT t.label 
               FROM orders o 
               LEFT JOIN room_types t ON o.room_type = t.name 
               WHERE (g.user_id IS NOT NULL AND o.user_id = g.user_id) 
                  OR (g.user_id IS NULL AND g.phone != '' AND o.guest_phone = g.phone)
                  OR (g.user_id IS NULL AND (g.phone = '' OR g.phone IS NULL) AND o.guest_name = g.name)
               ORDER BY o.created_at DESC 
               LIMIT 1
             ),
             '-'
           ) as ticket_type_label,
           (
             SELECT d.status
             FROM deposits d
             LEFT JOIN orders o ON d.order_id = o.id
             WHERE (g.user_id IS NOT NULL AND d.user_id = g.user_id)
                OR (g.user_id IS NULL AND o.id IS NOT NULL AND (
                     (g.phone != '' AND o.guest_phone = g.phone)
                     OR ((g.phone = '' OR g.phone IS NULL) AND o.guest_name = g.name)
                   ))
             ORDER BY d.created_at DESC
             LIMIT 1
           ) as deposit_status,
           (
             SELECT d.amount
             FROM deposits d
             LEFT JOIN orders o ON d.order_id = o.id
             WHERE (g.user_id IS NOT NULL AND d.user_id = g.user_id)
                OR (g.user_id IS NULL AND o.id IS NOT NULL AND (
                     (g.phone != '' AND o.guest_phone = g.phone)
                     OR ((g.phone = '' OR g.phone IS NULL) AND o.guest_name = g.name)
                   ))
             ORDER BY d.created_at DESC
             LIMIT 1
           ) as deposit_amount
    FROM guests g
    LEFT JOIN rooms r ON g.room_id = r.id
    LEFT JOIN users u ON g.user_id = u.id
    ORDER BY g.created_at DESC
  `).all();
}

function getGuestById(id) {
  return db.prepare(`
    SELECT g.id, g.user_id, g.room_id, g.check_in, g.check_out, g.status, g.created_at, g.updated_at,
           COALESCE(NULLIF(u.real_name, ''), g.name) as name,
           COALESCE(NULLIF(u.phone, ''), g.phone) as phone,
           COALESCE(NULLIF(u.id_card, ''), g.id_card) as id_card
    FROM guests g
    LEFT JOIN users u ON g.user_id = u.id
    WHERE g.id = ?
  `).get(id);
}

function createGuest({ name, phone, id_card, room_id, check_in, user_id }) {
  const stmt = db.prepare(`INSERT INTO guests (name, phone, id_card, room_id, check_in, user_id) VALUES (@n, @p, @ic, @ri, @ci, @uid)`);
  return stmt.run({ n: name, p: phone || '', ic: id_card || '', ri: room_id || null, ci: check_in || null, uid: user_id || null });
}

function getGuestByUserId(user_id) {
  return db.prepare('SELECT * FROM guests WHERE user_id = ?').get(user_id);
}

function upsertGuestByUserId(user_id, { name, phone, id_card }) {
  const existing = db.prepare('SELECT id FROM guests WHERE user_id = ?').get(user_id);
  if (existing) {
    db.prepare(`UPDATE guests SET name = @n, phone = @p, id_card = @ic, updated_at = datetime('now','localtime') WHERE user_id = @uid`)
      .run({ n: name, p: phone || '', ic: id_card || '', uid: user_id });
    return existing.id;
  } else {
    const res = db.prepare(`INSERT INTO guests (user_id, name, phone, id_card) VALUES (@uid, @n, @p, @ic)`)
      .run({ uid: user_id, n: name, p: phone || '', ic: id_card || '' });
    return res.lastInsertRowid;
  }
}

function deleteGuestsByUserId(user_id) {
  return db.prepare('DELETE FROM guests WHERE user_id = ?').run(user_id);
}

function deleteGuest(id) {
  return db.prepare('DELETE FROM guests WHERE id = ?').run(id);
}

function updateGuest(id, fields) {
  const safe = filterFields('guests', fields);
  const sets = [];
  const vals = {};
  for (const [k, v] of Object.entries(safe)) {
    sets.push(`${k} = @${k}`);
    vals[k] = v;
  }
  vals.id = id;
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now','localtime')");
  return db.prepare(`UPDATE guests SET ${sets.join(', ')} WHERE id = @id`).run(vals);
}

// -- 订单管理 --
function getAllOrders() {
  return db.prepare(`
    SELECT o.*, r.room_number, COALESCE(r.room_type, o.room_type) as room_type,
           COALESCE(t.label, r.room_type, o.room_type) as room_type_label,
           t.is_room_package, u.nickname as user_name,
           d.id as deposit_id, d.amount as deposit_amount, d.status as deposit_status
    FROM orders o
    LEFT JOIN rooms r ON o.room_id = r.id
    LEFT JOIN room_types t ON (r.room_type = t.name OR o.room_type = t.name)
    LEFT JOIN users u ON o.user_id = u.id
    LEFT JOIN deposits d ON d.order_id = o.id
    ORDER BY o.created_at DESC
  `).all();
}

function getOrderById(id) {
  return db.prepare(`
    SELECT o.*, r.room_number, COALESCE(r.room_type, o.room_type) as room_type,
           t.label as room_type_label, t.is_room_package
    FROM orders o
    LEFT JOIN rooms r ON o.room_id = r.id
    LEFT JOIN room_types t ON (r.room_type = t.name OR o.room_type = t.name)
    WHERE o.id = ?
  `).get(id);
}

function createOrder({ user_id, guest_name, guest_phone, room_id, total_price, remark, guests, room_type }) {
  const stmt = db.prepare(`INSERT INTO orders (user_id, guest_name, guest_phone, room_id, total_price, remark, guests, room_type)
    VALUES (@uid, @gn, @gp, @ri, @tp, @rm, @gs, @rt)`);
  return stmt.run({
    uid: user_id, gn: guest_name, gp: guest_phone || '', ri: room_id || null,
    tp: total_price || 0, rm: remark || '', gs: guests || 1, rt: room_type || ''
  });
}

function updateOrder(id, fields) {
  const safe = filterFields('orders', fields);
  const sets = [];
  const vals = {};
  for (const [k, v] of Object.entries(safe)) {
    sets.push(`${k} = @${k}`);
    vals[k] = v;
  }
  vals.id = id;
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now','localtime')");
  return db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = @id`).run(vals);
}

function deleteOrder(id) {
  db.prepare('DELETE FROM deposits WHERE order_id = ?').run(id);
  db.prepare('DELETE FROM order_guests WHERE order_id = ?').run(id);
  db.prepare('DELETE FROM verifications WHERE order_id = ?').run(id);
  return db.prepare('DELETE FROM orders WHERE id = ?').run(id);
}

// -- 核验 --
function verifyOrder({ order_id, verified_by, result, note }) {
  const stmt = db.prepare(`INSERT INTO verifications (order_id, verified_by, result, note) VALUES (?,?,?,?)`);
  return stmt.run(order_id, verified_by, result || 'success', note || '');
}

function getVerificationByOrder(order_id) {
  return db.prepare(`
    SELECT v.*, u.nickname
    FROM verifications v LEFT JOIN users u ON v.verified_by = u.id
    WHERE v.order_id = ? ORDER BY v.created_at DESC LIMIT 1
  `).get(order_id);
}

// -- 用户管理 --
function getAllUsers() {
  return db.prepare('SELECT id, username, nickname, phone, real_name, id_card, role, status, created_at, updated_at FROM users ORDER BY id DESC').all();
}

function updateUserPassword(id, hashedPassword) {
  return db.prepare(`UPDATE users SET password = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(hashedPassword, id);
}

function updateUserInfo(id, fields) {
  const safe = filterFields('users', fields);
  const sets = [];
  const vals = {};
  for (const [k, v] of Object.entries(safe)) {
    sets.push(`${k} = @${k}`);
    vals[k] = v;
  }
  vals.id = id;
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now','localtime')");
  return db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = @id`).run(vals);
}

// -- 房间类型管理 --
function getAllRoomTypes() {
  return db.prepare('SELECT * FROM room_types ORDER BY id').all();
}

function getRoomTypeById(id) {
  return db.prepare('SELECT * FROM room_types WHERE id = ?').get(id);
}

function getRoomTypeByName(name) {
  return db.prepare('SELECT * FROM room_types WHERE name = ?').get(name);
}

function createRoomType({ name, label, base_price, description, default_deposit, is_room_package, hotel_room_type, stock }) {
  const stmt = db.prepare(`INSERT INTO room_types (name, label, base_price, description, default_deposit, is_room_package, hotel_room_type, stock) VALUES (@name, @label, @base_price, @description, @default_deposit, @is_room_package, @hotel_room_type, @stock)`);
  return stmt.run({
    name, label: label || '', base_price: base_price || 0, description: description || '',
    default_deposit: default_deposit || 0, is_room_package: is_room_package || 0,
    hotel_room_type: hotel_room_type || null, stock: stock || 0
  });
}

function updateRoomType(id, fields) {
  const safe = filterFields('room_types', fields);
  const sets = [];
  const vals = {};
  for (const [k, v] of Object.entries(safe)) {
    sets.push(`${k} = @${k}`);
    vals[k] = v;
  }
  vals.id = id;
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now','localtime')");
  return db.prepare(`UPDATE room_types SET ${sets.join(', ')} WHERE id = @id`).run(vals);
}

function deleteRoomType(id) {
  return db.prepare('DELETE FROM room_types WHERE id = ?').run(id);
}

// -- 订单入住人管理 --
function getOrderGuests(order_id) {
  return db.prepare(`
    SELECT og.user_id, u.nickname, u.avatar, u.phone
    FROM order_guests og
    LEFT JOIN users u ON og.user_id = u.id
    WHERE og.order_id = ?
  `).all(order_id);
}

function setOrderGuests(order_id, userIds) {
  db.prepare('DELETE FROM order_guests WHERE order_id = ?').run(order_id);
  const insert = db.prepare('INSERT INTO order_guests (order_id, user_id) VALUES (?, ?)');
  for (const uid of userIds) {
    insert.run(order_id, uid);
  }
}

function getOrdersByUserId(user_id) {
  return db.prepare(`
    SELECT DISTINCT o.*, r.room_number, COALESCE(r.room_type, o.room_type) as room_type,
           COALESCE(t.label, r.room_type, o.room_type) as room_type_label,
           t.is_room_package
    FROM orders o
    LEFT JOIN rooms r ON o.room_id = r.id
    LEFT JOIN room_types t ON (r.room_type = t.name OR o.room_type = t.name)
    LEFT JOIN order_guests og ON og.order_id = o.id
    WHERE o.user_id = ? OR og.user_id = ?
    ORDER BY o.created_at DESC
  `).all(user_id, user_id);
}

function getRoomOccupants(room_id) {
  return db.prepare(`
    SELECT DISTINCT u.id, u.nickname, u.real_name, u.avatar, u.phone, sub.order_id
    FROM (
      SELECT o.user_id as uid, o.id as order_id
      FROM orders o
      WHERE o.room_id = ? AND o.status IN ('approved', 'confirmed', 'checked_in', 'pending')
      UNION
      SELECT og.user_id as uid, og.order_id as order_id
      FROM order_guests og
      JOIN orders o ON og.order_id = o.id
      WHERE o.room_id = ? AND o.status IN ('approved', 'confirmed', 'checked_in', 'pending')
    ) sub
    JOIN users u ON u.id = sub.uid
  `).all(room_id, room_id);
}

// -- 已实名客人（从 users 表读取）--
function getVerifiedUsers() {
  return db.prepare(`
    SELECT id, username, nickname, phone, real_name, id_card, avatar, role, created_at, updated_at
    FROM users
    WHERE real_name != '' AND id_card != ''
    ORDER BY updated_at DESC
  `).all();
}

function getVerifiedUserById(id) {
  return db.prepare(`
    SELECT id, username, nickname, phone, real_name, id_card, avatar, role, created_at, updated_at
    FROM users
    WHERE id = ? AND real_name != '' AND id_card != ''
  `).get(id);
}

// -- 押金管理 --
function getAllDeposits() {
  return db.prepare(`
    SELECT d.*, u.nickname as user_nickname, u.username,
           r.room_number, o.guest_name
    FROM deposits d
    LEFT JOIN users u ON d.user_id = u.id
    LEFT JOIN rooms r ON d.room_id = r.id
    LEFT JOIN orders o ON d.order_id = o.id
    ORDER BY d.created_at DESC
  `).all();
}

function getDepositById(id) {
  return db.prepare(`
    SELECT d.*, u.nickname as user_nickname, u.username,
           r.room_number, o.guest_name
    FROM deposits d
    LEFT JOIN users u ON d.user_id = u.id
    LEFT JOIN rooms r ON d.room_id = r.id
    LEFT JOIN orders o ON d.order_id = o.id
    WHERE d.id = ?
  `).get(id);
}

function getDepositByOrderId(order_id) {
  return db.prepare('SELECT * FROM deposits WHERE order_id = ?').get(order_id);
}

function createDeposit({ order_id, user_id, room_id, amount, operator_id }) {
  return db.prepare(`
    INSERT INTO deposits (order_id, user_id, room_id, amount, operator_id)
    VALUES (@order_id, @user_id, @room_id, @amount, @operator_id)
  `).run({ order_id: order_id || null, user_id, room_id: room_id || null, amount, operator_id: operator_id || null });
}

function refundDeposit(id, operator_id, remark) {
  return db.prepare(`
    UPDATE deposits SET status = 'refunded', remark = ?, operator_id = ?, resolved_at = datetime('now','localtime')
    WHERE id = ? AND status = 'collected'
  `).run(remark || '', operator_id, id);
}

function forfeitDeposit(id, operator_id, remark) {
  return db.prepare(`
    UPDATE deposits SET status = 'forfeited', remark = ?, operator_id = ?, resolved_at = datetime('now','localtime')
    WHERE id = ? AND status = 'collected'
  `).run(remark, operator_id, id);
}

function deleteDepositByOrderId(order_id) {
  return db.prepare('DELETE FROM deposits WHERE order_id = ?').run(order_id);
}

// -- STAFF 押金管理 --
function getAllStaffDeposits() {
  return db.prepare(`
    SELECT sd.*,
           u.username as staff_username, u.nickname as staff_nickname, u.phone as staff_phone,
           op.nickname as operator_name
    FROM staff_deposits sd
    LEFT JOIN users u ON sd.user_id = u.id
    LEFT JOIN users op ON sd.operator_id = op.id
    ORDER BY sd.id DESC
  `).all();
}

function getStaffDepositById(id) {
  return db.prepare(`
    SELECT sd.*,
           u.username as staff_username, u.nickname as staff_nickname, u.phone as staff_phone,
           op.nickname as operator_name
    FROM staff_deposits sd
    LEFT JOIN users u ON sd.user_id = u.id
    LEFT JOIN users op ON sd.operator_id = op.id
    WHERE sd.id = ?
  `).get(id);
}

function getStaffDepositByUserId(userId) {
  return db.prepare(`
    SELECT sd.*,
           u.username as staff_username, u.nickname as staff_nickname, u.phone as staff_phone,
           op.nickname as operator_name
    FROM staff_deposits sd
    LEFT JOIN users u ON sd.user_id = u.id
    LEFT JOIN users op ON sd.operator_id = op.id
    WHERE sd.user_id = ?
    ORDER BY sd.id DESC
  `).all(userId);
}

function createStaffDeposit({ user_id, amount, status, remark, operator_id }) {
  const stmt = db.prepare(`
    INSERT INTO staff_deposits (user_id, amount, status, remark, operator_id)
    VALUES (@user_id, @amount, @status, @remark, @operator_id)
  `);
  return stmt.run({
    user_id,
    amount: amount || 0,
    status: status || 'collected',
    remark: remark || '',
    operator_id: operator_id || null,
  });
}

function refundStaffDeposit(id, operator_id, remark) {
  return db.prepare(`
    UPDATE staff_deposits
    SET status = 'refunded',
        operator_id = ?,
        remark = ?,
        resolved_at = datetime('now','localtime'),
        updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(operator_id, remark || '退还STAFF押金', id);
}

function forfeitStaffDeposit(id, operator_id, remark) {
  return db.prepare(`
    UPDATE staff_deposits
    SET status = 'forfeited',
        operator_id = ?,
        remark = ?,
        resolved_at = datetime('now','localtime'),
        updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(operator_id, remark || '扣除STAFF押金', id);
}

function deleteStaffDeposit(id) {
  return db.prepare('DELETE FROM staff_deposits WHERE id = ?').run(id);
}

// -- 系统设置 --
function getSystemSetting(key) {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSystemSetting(key, value) {
  return db.prepare(`
    INSERT INTO system_settings (key, value, updated_at) VALUES (@key, @value, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = datetime('now','localtime')
  `).run({ key, value: String(value) });
}

function getAllSettings() {
  return db.prepare('SELECT * FROM system_settings').all();
}

// -- 邀请码 --
function createInviteCode({ code, created_by, max_uses, expires_at }) {
  return db.prepare(`
    INSERT INTO invite_codes (code, created_by, max_uses, expires_at)
    VALUES (@code, @created_by, @max_uses, @expires_at)
  `).run({ code, created_by, max_uses: max_uses || 1, expires_at: expires_at || null });
}

function getInviteCodes() {
  return db.prepare('SELECT * FROM invite_codes ORDER BY id DESC').all();
}

function getInviteCodeByCode(code) {
  return db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(code);
}

function useInviteCode(code, userId) {
  return db.prepare(`
    UPDATE invite_codes SET use_count = use_count + 1 WHERE code = ?
  `).run(code);
}

function updateInviteCodeStatus(id, status) {
  return db.prepare('UPDATE invite_codes SET status = ? WHERE id = ?').run(status, id);
}

function deleteInviteCode(id) {
  return db.prepare('DELETE FROM invite_codes WHERE id = ?').run(id);
}

// -- 用户审核 --
function getPendingUsers() {
  return db.prepare("SELECT id, username, nickname, phone, created_at FROM users WHERE status = 'pending' ORDER BY id DESC").all();
}

function approveUser(id) {
  return db.prepare("UPDATE users SET status = 'active', updated_at = datetime('now','localtime') WHERE id = ?").run(id);
}

function rejectUser(id) {
  return db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

// -- 酒店客房房型管理 --
function getAllHotelRoomTypes() {
  return db.prepare('SELECT * FROM hotel_room_types ORDER BY id').all();
}

function getHotelRoomTypeById(id) {
  return db.prepare('SELECT * FROM hotel_room_types WHERE id = ?').get(id);
}

function getHotelRoomTypeByName(name) {
  return db.prepare('SELECT * FROM hotel_room_types WHERE name = ?').get(name);
}

function createHotelRoomType({ name, label, base_price, description, default_deposit, capacity }) {
  const stmt = db.prepare(`INSERT INTO hotel_room_types (name, label, base_price, description, default_deposit, capacity) VALUES (@name, @label, @base_price, @description, @default_deposit, @capacity)`);
  return stmt.run({
    name, label: label || '', base_price: base_price || 0, description: description || '',
    default_deposit: default_deposit || 0, capacity: capacity || 2
  });
}

function updateHotelRoomType(id, fields) {
  const safe = filterFields('hotel_room_types', fields);
  const sets = [];
  const vals = {};
  for (const [k, v] of Object.entries(safe)) {
    sets.push(`${k} = @${k}`);
    vals[k] = v;
  }
  vals.id = id;
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now','localtime')");
  return db.prepare(`UPDATE hotel_room_types SET ${sets.join(', ')} WHERE id = @id`).run(vals);
}

function deleteHotelRoomType(id) {
  return db.prepare('DELETE FROM hotel_room_types WHERE id = ?').run(id);
}

module.exports = {
  db,
  findUserByUsername,
  findUserById,
  createUser,
  updateLoginTime,
  getDashboardStats,
  getAllRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  getAllGuests,
  getGuestById,
  createGuest,
  updateGuest,
  getGuestByUserId,
  upsertGuestByUserId,
  deleteGuestsByUserId,
  deleteGuest,
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
  verifyOrder,
  getVerificationByOrder,
  getAllUsers,
  updateUserPassword,
  updateUserInfo,
  getAllRoomTypes,
  getRoomTypeById,
  createRoomType,
  updateRoomType,
  deleteRoomType,
  getOrderGuests,
  setOrderGuests,
  getOrdersByUserId,
  getRoomOccupants,
  getVerifiedUsers,
  getVerifiedUserById,
  getAllDeposits,
  getDepositById,
  getDepositByOrderId,
  createDeposit,
  refundDeposit,
  deleteDepositByOrderId,
  getAllStaffDeposits,
  getStaffDepositById,
  getStaffDepositByUserId,
  createStaffDeposit,
  refundStaffDeposit,
  forfeitStaffDeposit,
  deleteStaffDeposit,
  getRoomTypeByName,
  getSystemSetting,
  setSystemSetting,
  getAllSettings,
  createInviteCode,
  getInviteCodes,
  getInviteCodeByCode,
  useInviteCode,
  updateInviteCodeStatus,
  deleteInviteCode,
  getPendingUsers,
  approveUser,
  rejectUser,
  getAllHotelRoomTypes,
  getHotelRoomTypeById,
  getHotelRoomTypeByName,
  createHotelRoomType,
  updateHotelRoomType,
  deleteHotelRoomType,
};
