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
`);

// ---------- 迁移：从 rooms 表同步已有房间类型到 room_types ----------
const existingTypes = db.prepare('SELECT COUNT(*) as cnt FROM room_types').get();
if (existingTypes.cnt === 0) {
  const types = db.prepare('SELECT DISTINCT room_type FROM rooms').all();
  const labelMap = { standard: '标准房', deluxe: '豪华房', suite: '套房' };
  const priceMap = { standard: 288, deluxe: 488, suite: 888 };
  const insertType = db.prepare('INSERT OR IGNORE INTO room_types (name, label, base_price) VALUES (?, ?, ?)');
  for (const t of types) {
    insertType.run(t.room_type, labelMap[t.room_type] || t.room_type, priceMap[t.room_type] || 0);
  }
}

// ---------- 迁移：为已有 guests 表补充 user_id 列 ----------
const guestCols = db.prepare("PRAGMA table_info(guests)").all().map(c => c.name);
if (!guestCols.includes('user_id')) {
  db.exec("ALTER TABLE guests ADD COLUMN user_id INTEGER REFERENCES users(id)");
}

// ---------- 迁移：为 room_types 表补充 default_deposit 列 ----------
const rtCols = db.prepare("PRAGMA table_info(room_types)").all().map(c => c.name);
if (!rtCols.includes('default_deposit')) {
  db.exec("ALTER TABLE room_types ADD COLUMN default_deposit REAL NOT NULL DEFAULT 0");
}

// ---------- 迁移：为 orders 表补充 room_type 列（存储用户申请的房型） ----------
const orderCols = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
if (!orderCols.includes('room_type')) {
  db.exec("ALTER TABLE orders ADD COLUMN room_type TEXT NOT NULL DEFAULT ''");
}
// ---------- 迁移：为 orders 表补充 reject_reason 列 ----------
if (!orderCols.includes('reject_reason')) {
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
db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('site_title', 'FurryHotel')").run();
db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('site_subtitle', 'xxx小聚，欢迎参加')").run();
db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('copyright_text', '© 2024 FurryHotel')").run();
// 插入默认设置：注册模式（open/closed/review/invite）
db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('registration_mode', 'open')").run();

// ---------- 迁移：为 users 表补充 status 列 ----------
const userCols2 = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols2.includes('status')) {
  db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}

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

  // 插入示例房间
  const rooms = [
    ['101', 'standard', 1, 288, 'available', '标准大床房，朝南'],
    ['102', 'standard', 1, 288, 'available', '标准大床房，朝北'],
    ['201', 'deluxe', 2, 488, 'available', '豪华双床房，带阳台'],
    ['202', 'deluxe', 2, 488, 'occupied', '豪华双床房，带阳台'],
    ['301', 'suite', 3, 888, 'available', '行政套房，一室一厅'],
    ['302', 'suite', 3, 888, 'maintenance', '总统套房，全景落地窗'],
    ['103', 'standard', 1, 288, 'cleaning', '标准大床房'],
    ['203', 'deluxe', 2, 488, 'available', '豪华大床房'],
  ];
  const insertRoom = db.prepare(`INSERT INTO rooms (room_number, room_type, floor, price, status, description) VALUES (?,?,?,?,?,?)`);
  for (const r of rooms) {
    insertRoom.run(...r);
  }
}

// ---------- 字段白名单（防止 SQL 列名注入） ----------
const ALLOWED_FIELDS = {
  rooms: ['room_number', 'room_type', 'floor', 'price', 'status', 'description'],
  guests: ['name', 'phone', 'id_card', 'room_id', 'check_in', 'check_out', 'status', 'user_id'],
  orders: ['guest_name', 'guest_phone', 'room_id', 'total_price', 'status', 'remark', 'room_type', 'reject_reason'],
  users: ['nickname', 'phone', 'role', 'real_name', 'id_card', 'avatar', 'status'],
  room_types: ['name', 'label', 'base_price', 'description', 'default_deposit'],
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
    if (allowed.includes(k)) {
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
  const stmt = db.prepare('SELECT id, username, nickname, phone, avatar, role, real_name, id_card, created_at, updated_at FROM users WHERE id = ?');
  return stmt.get(id);
}

/**
 * 创建新用户
 * @returns {{ id: number }} 新用户ID
 */
function createUser({ username, password, nickname, phone }) {
  const stmt = db.prepare(`
    INSERT INTO users (username, password, nickname, phone)
    VALUES (@username, @password, @nickname, @phone)
  `);
  const result = stmt.run({ username, password, nickname: nickname || '', phone: phone || '' });
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
    SELECT r.*,
           u.nickname AS occupant_nickname,
           u.avatar AS occupant_avatar
    FROM rooms r
    LEFT JOIN orders o ON o.room_id = r.id AND o.status IN ('approved', 'confirmed', 'checked_in', 'pending')
    LEFT JOIN users u ON u.id = o.user_id
    ORDER BY r.floor, r.room_number
  `).all();
}

function getRoomById(id) {
  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
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
    SELECT g.*, r.room_number, r.room_type, u.username, u.nickname as user_nickname
    FROM guests g
    LEFT JOIN rooms r ON g.room_id = r.id
    LEFT JOIN users u ON g.user_id = u.id
    ORDER BY g.created_at DESC
  `).all();
}

function getGuestById(id) {
  return db.prepare('SELECT * FROM guests WHERE id = ?').get(id);
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
    SELECT o.*, r.room_number, r.room_type, u.nickname as user_name,
           d.id as deposit_id, d.amount as deposit_amount, d.status as deposit_status
    FROM orders o
    LEFT JOIN rooms r ON o.room_id = r.id
    LEFT JOIN users u ON o.user_id = u.id
    LEFT JOIN deposits d ON d.order_id = o.id
    ORDER BY o.created_at DESC
  `).all();
}

function getOrderById(id) {
  return db.prepare(`
    SELECT o.*, r.room_number, r.room_type
    FROM orders o LEFT JOIN rooms r ON o.room_id = r.id
    WHERE o.id = ?
  `).get(id);
}

function createOrder({ user_id, guest_name, guest_phone, room_id, total_price, remark }) {
  const stmt = db.prepare(`INSERT INTO orders (user_id, guest_name, guest_phone, room_id, total_price, remark)
    VALUES (@uid, @gn, @gp, @ri, @tp, @rm)`);
  return stmt.run({
    uid: user_id, gn: guest_name, gp: guest_phone || '', ri: room_id || null,
    tp: total_price || 0, rm: remark || ''
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
  return db.prepare('SELECT id, username, nickname, phone, real_name, id_card, role, created_at, updated_at FROM users ORDER BY id').all();
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

function createRoomType({ name, label, base_price, description, default_deposit }) {
  const stmt = db.prepare(`INSERT INTO room_types (name, label, base_price, description, default_deposit) VALUES (@name, @label, @base_price, @description, @default_deposit)`);
  return stmt.run({ name, label: label || '', base_price: base_price || 0, description: description || '', default_deposit: default_deposit || 0 });
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
    SELECT DISTINCT o.*, r.room_number, r.room_type,
           COALESCE(t.label, r.room_type) as room_type_label
    FROM orders o
    LEFT JOIN rooms r ON o.room_id = r.id
    LEFT JOIN room_types t ON r.room_type = t.name
    LEFT JOIN order_guests og ON og.order_id = o.id
    WHERE o.user_id = ? OR og.user_id = ?
    ORDER BY o.created_at DESC
  `).all(user_id, user_id);
}

function getRoomOccupants(room_id) {
  return db.prepare(`
    SELECT DISTINCT u.id, u.nickname, u.real_name, u.avatar
    FROM orders o
    JOIN order_guests og ON og.order_id = o.id
    JOIN users u ON og.user_id = u.id
    WHERE o.room_id = ? AND o.status IN ('approved', 'confirmed', 'checked_in', 'pending')
  `).all(room_id);
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
  forfeitDeposit,
  deleteDepositByOrderId,
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
};
