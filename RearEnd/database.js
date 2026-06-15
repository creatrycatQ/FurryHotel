/**
 * SQLite 数据库初始化和操作模块
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'furry_hotel.db');

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
    check_in_date TEXT    NOT NULL,
    check_out_date TEXT   NOT NULL,
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

// ---------- 插入默认管理员和示例数据 ----------
const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!admin) {
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`INSERT INTO users (username, password, nickname, role)
    VALUES ('admin', ?, '管理员', 'admin')`).run(hash);

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
  orders: ['guest_name', 'guest_phone', 'room_id', 'check_in_date', 'check_out_date', 'total_price', 'status', 'remark'],
  users: ['nickname', 'phone', 'role', 'real_name', 'id_card', 'avatar'],
  room_types: ['name', 'label', 'base_price', 'description'],
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
  const guestCount = db.prepare('SELECT COUNT(*) as count FROM guests').get();
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get();
  const todayCheckIn = db.prepare("SELECT COUNT(*) as count FROM orders WHERE check_in_date = date('now','localtime') AND status='confirmed'").get();
  const todayRevenue = db.prepare("SELECT COALESCE(SUM(total_price),0) as total FROM orders WHERE check_in_date = date('now','localtime') AND status='confirmed'").get();
  return {
    totalRooms: roomCount.count,
    availableRooms: availableRooms.count,
    occupiedRooms: occupiedRooms.count,
    totalGuests: guestCount.count,
    totalOrders: orderCount.count,
    todayCheckIn: todayCheckIn.count,
    todayRevenue: todayRevenue.total,
  };
}

// -- 房间管理 --
function getAllRooms() {
  return db.prepare('SELECT * FROM rooms ORDER BY floor, room_number').all();
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
    SELECT o.*, r.room_number, r.room_type, u.nickname as user_name
    FROM orders o
    LEFT JOIN rooms r ON o.room_id = r.id
    LEFT JOIN users u ON o.user_id = u.id
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

function createOrder({ user_id, guest_name, guest_phone, room_id, check_in_date, check_out_date, total_price, remark }) {
  const stmt = db.prepare(`INSERT INTO orders (user_id, guest_name, guest_phone, room_id, check_in_date, check_out_date, total_price, remark)
    VALUES (@uid, @gn, @gp, @ri, @cid, @cod, @tp, @rm)`);
  return stmt.run({
    uid: user_id, gn: guest_name, gp: guest_phone || '', ri: room_id || null,
    cid: check_in_date, cod: check_out_date, tp: total_price || 0, rm: remark || ''
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
  return db.prepare('SELECT id, username, nickname, phone, role, created_at, updated_at FROM users ORDER BY id').all();
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

function createRoomType({ name, label, base_price, description }) {
  const stmt = db.prepare(`INSERT INTO room_types (name, label, base_price, description) VALUES (@name, @label, @base_price, @description)`);
  return stmt.run({ name, label: label || '', base_price: base_price || 0, description: description || '' });
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
};
