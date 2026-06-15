/**
 * 管理后台路由：仪表盘 / 房间 / 客人 / 订单 / 核验 / 用户
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const {
  getDashboardStats,
  getAllRooms, getRoomById, createRoom, updateRoom, deleteRoom,
  getAllGuests, getGuestById, createGuest, updateGuest,
  getAllOrders, getOrderById, createOrder, updateOrder, deleteOrder,
  verifyOrder, getVerificationByOrder,
  getAllUsers, updateUserPassword, updateUserInfo,
  findUserByUsername, createUser, findUserById,
  getAllRoomTypes, getRoomTypeById, createRoomType, updateRoomType, deleteRoomType,
  db,
} = require('../database');

const { JWT_SECRET } = require('../config');

const router = express.Router();

// ---------- 鉴权中间件（需管理员角色） ----------
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未登录' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    // 从数据库获取用户信息并检查角色
    const user = findUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ code: 401, message: '用户不存在' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ code: 403, message: '权限不足，仅管理员可访问' });
    }
    req.user = decoded;
    req.user.role = user.role;
    next();
  } catch {
    return res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
  }
}

// ---------- 仪表盘 ----------
router.get('/dashboard', authMiddleware, (req, res) => {
  const stats = getDashboardStats();
  res.json({ code: 200, data: stats });
});

// ========== 房间管理 ==========

router.get('/rooms', authMiddleware, (req, res) => {
  const rooms = getAllRooms();
  res.json({ code: 200, data: rooms });
});

router.get('/rooms/:id', authMiddleware, (req, res) => {
  const room = getRoomById(req.params.id);
  if (!room) return res.status(404).json({ code: 404, message: '房间不存在' });
  res.json({ code: 200, data: room });
});

router.post('/rooms', authMiddleware, (req, res) => {
  const { room_number, room_type, floor, price, description } = req.body;
  if (!room_number) return res.status(400).json({ code: 400, message: '房间号不能为空' });
  try {
    const result = createRoom({ room_number, room_type: room_type || 'standard', floor: floor || 1, price: price || 0, description });
    res.json({ code: 201, message: '添加成功', data: { id: result.lastInsertRowid } });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ code: 409, message: '该房间号已存在' });
    }
    throw err;
  }
});

router.put('/rooms/:id', authMiddleware, (req, res) => {
  const { room_number, room_type, floor, price, status, description } = req.body;
  const fields = {};
  if (room_number !== undefined) fields.room_number = room_number;
  if (room_type !== undefined) fields.room_type = room_type;
  if (floor !== undefined) fields.floor = floor;
  if (price !== undefined) fields.price = price;
  if (status !== undefined) fields.status = status;
  if (description !== undefined) fields.description = description;
  updateRoom(req.params.id, fields);
  res.json({ code: 200, message: '更新成功' });
});

router.delete('/rooms/:id', authMiddleware, (req, res) => {
  deleteRoom(req.params.id);
  res.json({ code: 200, message: '删除成功' });
});

// ========== 客人管理 ==========

router.get('/guests', authMiddleware, (req, res) => {
  const guests = getAllGuests();
  res.json({ code: 200, data: guests });
});

router.get('/guests/:id', authMiddleware, (req, res) => {
  const guest = getGuestById(req.params.id);
  if (!guest) return res.status(404).json({ code: 404, message: '客人不存在' });
  res.json({ code: 200, data: guest });
});

router.post('/guests', authMiddleware, (req, res) => {
  const { name, phone, id_card, room_id, check_in } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '姓名不能为空' });
  const result = createGuest({ name, phone, id_card, room_id, check_in });
  res.json({ code: 201, message: '添加成功', data: { id: result.lastInsertRowid } });
});

router.put('/guests/:id', authMiddleware, (req, res) => {
  const { name, phone, id_card, room_id, check_in, check_out, status } = req.body;
  const fields = {};
  if (name !== undefined) fields.name = name;
  if (phone !== undefined) fields.phone = phone;
  if (id_card !== undefined) fields.id_card = id_card;
  if (room_id !== undefined) fields.room_id = room_id;
  if (check_in !== undefined) fields.check_in = check_in;
  if (check_out !== undefined) fields.check_out = check_out;
  if (status !== undefined) fields.status = status;
  updateGuest(req.params.id, fields);
  res.json({ code: 200, message: '更新成功' });
});

router.delete('/guests/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM guests WHERE id = ?').run(req.params.id);
  res.json({ code: 200, message: '删除成功' });
});

// ========== 订单管理 ==========

router.get('/orders', authMiddleware, (req, res) => {
  const orders = getAllOrders();
  res.json({ code: 200, data: orders });
});

router.get('/orders/:id', authMiddleware, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
  res.json({ code: 200, data: order });
});

router.post('/orders', authMiddleware, (req, res) => {
  const { user_id, guest_name, guest_phone, room_id, check_in_date, check_out_date, total_price, remark } = req.body;
  if (!guest_name) return res.status(400).json({ code: 400, message: '客人姓名不能为空' });
  const result = createOrder({
    user_id: user_id || req.user.id,
    guest_name, guest_phone, room_id, check_in_date, check_out_date, total_price, remark
  });
  res.json({ code: 201, message: '下单成功', data: { id: result.lastInsertRowid } });
});

router.put('/orders/:id', authMiddleware, (req, res) => {
  const { guest_name, guest_phone, room_id, check_in_date, check_out_date, total_price, status, remark } = req.body;
  const fields = {};
  if (guest_name !== undefined) fields.guest_name = guest_name;
  if (guest_phone !== undefined) fields.guest_phone = guest_phone;
  if (room_id !== undefined) fields.room_id = room_id;
  if (check_in_date !== undefined) fields.check_in_date = check_in_date;
  if (check_out_date !== undefined) fields.check_out_date = check_out_date;
  if (total_price !== undefined) fields.total_price = total_price;
  if (status !== undefined) fields.status = status;
  if (remark !== undefined) fields.remark = remark;
  updateOrder(req.params.id, fields);

  // 订单状态变更时同步房间状态
  if (status !== undefined) {
    const order = getOrderById(req.params.id);
    if (order && order.room_id) {
      if (status === 'confirmed') {
        updateRoom(order.room_id, { status: 'occupied' });
      } else if (status === 'cancelled' || status === 'completed') {
        // 检查该房间是否还有其他活跃订单
        const activeOrders = db.prepare(
          `SELECT id FROM orders WHERE room_id = ? AND id != ? AND status IN ('pending', 'confirmed')`
        ).all(order.room_id, order.id);
        if (activeOrders.length === 0) {
          updateRoom(order.room_id, { status: 'available' });
        }
      } else if (status === 'pending') {
        updateRoom(order.room_id, { status: 'reserved' });
      }
    }
  }

  res.json({ code: 200, message: '更新成功' });
});

router.delete('/orders/:id', authMiddleware, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });

  // 事务：释放房间 + 删除关联核验记录 + 删除订单
  const deleteTransaction = db.transaction(() => {
    // 如果订单关联房间且处于活跃状态，释放房间
    if (order.room_id && (order.status === 'pending' || order.status === 'confirmed')) {
      const activeOrders = db.prepare(
        `SELECT id FROM orders WHERE room_id = ? AND id != ? AND status IN ('pending', 'confirmed')`
      ).all(order.room_id, order.id);
      if (activeOrders.length === 0) {
        updateRoom(order.room_id, { status: 'available' });
      }
    }
    // 先删除关联的核验记录，避免外键约束失败
    db.prepare('DELETE FROM verifications WHERE order_id = ?').run(req.params.id);
    deleteOrder(req.params.id);
  });

  deleteTransaction();
  res.json({ code: 200, message: '删除成功' });
});

// ========== 在线核验 ==========

router.post('/verify', authMiddleware, (req, res) => {
  const { order_id, result, note } = req.body;
  if (!order_id) return res.status(400).json({ code: 400, message: '订单ID不能为空' });

  const order = getOrderById(order_id);
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });

  verifyOrder({ order_id, verified_by: req.user.id, result: result || 'success', note: note || '' });

  // 核验通过自动确认订单并将房间状态改为入住中
  if (result === 'success' || !result) {
    updateOrder(order_id, { status: 'confirmed' });
    if (order.room_id) {
      updateRoom(order.room_id, { status: 'occupied' });
    }
  }

  res.json({ code: 200, message: '核验完成' });
});

router.get('/verify/:order_id', authMiddleware, (req, res) => {
  const v = getVerificationByOrder(req.params.order_id);
  res.json({ code: 200, data: v || null });
});

// ========== 用户管理 ==========

router.get('/users', authMiddleware, (req, res) => {
  const users = getAllUsers();
  res.json({ code: 200, data: users });
});

router.post('/users', authMiddleware, (req, res) => {
  const { username, password, nickname, phone, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ code: 400, message: '用户名需3-20位字母、数字或下划线' });
  }
  if (password.length < 6) {
    return res.status(400).json({ code: 400, message: '密码至少6位' });
  }
  const existing = findUserByUsername(username);
  if (existing) {
    return res.status(409).json({ code: 409, message: '该用户名已被使用' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const result = createUser({ username, password: hash, nickname: nickname || username, phone: phone || '' });
  if (role === 'admin') {
    updateUserInfo(result.id, { role: 'admin' });
  }
  res.json({ code: 201, message: '创建成功', data: { id: result.id } });
});

router.put('/users/:id/password', authMiddleware, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ code: 400, message: '密码至少6位' });
  }
  const hash = bcrypt.hashSync(password, 10);
  updateUserPassword(req.params.id, hash);
  res.json({ code: 200, message: '密码修改成功' });
});

router.put('/users/:id', authMiddleware, (req, res) => {
  const { nickname, phone, role } = req.body;
  const fields = {};
  if (nickname !== undefined) fields.nickname = nickname;
  if (phone !== undefined) fields.phone = phone;
  if (role !== undefined) fields.role = role;
  updateUserInfo(req.params.id, fields);
  res.json({ code: 200, message: '更新成功' });
});

router.delete('/users/:id', authMiddleware, (req, res) => {
  var user = findUserById(req.params.id);
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });
  if (user.role === 'admin') {
    var c = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin'").get();
    if (c.c <= 1) return res.status(400).json({ code: 400, message: '不能删除最后一个管理员' });
  }

  // 事务：级联删除关联数据
  const deleteTransaction = db.transaction(() => {
    // 删除关联的客人记录
    db.prepare('DELETE FROM guests WHERE user_id = ?').run(req.params.id);
    // 释放该用户活跃订单关联的房间，删除核验记录和订单
    const userOrders = db.prepare('SELECT id, room_id, status FROM orders WHERE user_id = ?').all(req.params.id);
    for (const order of userOrders) {
      if (order.room_id && (order.status === 'pending' || order.status === 'confirmed')) {
        const otherActive = db.prepare(
          `SELECT id FROM orders WHERE room_id = ? AND id != ? AND status IN ('pending', 'confirmed')`
        ).all(order.room_id, order.id);
        if (otherActive.length === 0) {
          updateRoom(order.room_id, { status: 'available' });
        }
      }
      db.prepare('DELETE FROM verifications WHERE order_id = ?').run(order.id);
    }
    db.prepare('DELETE FROM orders WHERE user_id = ?').run(req.params.id);
    // 删除用户
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  });

  deleteTransaction();
  res.json({ code: 200, message: '删除成功' });
});

// ==================== 房间类型管理 ====================

// 获取所有房间类型
router.get('/room-types', authMiddleware, (req, res) => {
  const list = getAllRoomTypes().map(t => ({
    id: t.id, name: t.name, label: t.label,
    basePrice: t.base_price, description: t.description,
    created_at: t.created_at, updated_at: t.updated_at
  }));
  res.json({ code: 200, data: list });
});

// 获取单个房间类型
router.get('/room-types/:id', authMiddleware, (req, res) => {
  const item = getRoomTypeById(req.params.id);
  if (!item) return res.status(404).json({ code: 404, message: '房间类型不存在' });
  res.json({ code: 200, data: {
    id: item.id, name: item.name, label: item.label,
    basePrice: item.base_price, description: item.description,
    created_at: item.created_at, updated_at: item.updated_at
  }});
});

// 新增房间类型
router.post('/room-types', authMiddleware, (req, res) => {
  const { name, label, basePrice, description } = req.body;
  const base_price = basePrice;
  if (!name || base_price == null) {
    return res.status(400).json({ code: 400, message: '名称和基础价格为必填项' });
  }
  try {
    const result = createRoomType({ name, label, base_price, description });
    res.json({ code: 200, message: '创建成功', data: { id: result.lastInsertRowid } });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ code: 400, message: '房间类型名称已存在' });
    }
    res.status(500).json({ code: 500, message: '创建失败' });
  }
});

// 更新房间类型
router.put('/room-types/:id', authMiddleware, (req, res) => {
  const existing = getRoomTypeById(req.params.id);
  if (!existing) return res.status(404).json({ code: 404, message: '房间类型不存在' });
  const { name, label, basePrice, description } = req.body;
  const base_price = basePrice;
  try {
    updateRoomType(req.params.id, { name, label, base_price, description });
    res.json({ code: 200, message: '更新成功' });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ code: 400, message: '房间类型名称已存在' });
    }
    res.status(500).json({ code: 500, message: '更新失败' });
  }
});

// 删除房间类型
router.delete('/room-types/:id', authMiddleware, (req, res) => {
  const existing = getRoomTypeById(req.params.id);
  if (!existing) return res.status(404).json({ code: 404, message: '房间类型不存在' });
  // 检查是否有房间在使用该类型
  const inUse = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE room_type = ?').get(existing.name);
  if (inUse && inUse.c > 0) {
    return res.status(400).json({ code: 400, message: `该类型下仍有 ${inUse.c} 个房间，无法删除` });
  }
  deleteRoomType(req.params.id);
  res.json({ code: 200, message: '删除成功' });
});

module.exports = router;
