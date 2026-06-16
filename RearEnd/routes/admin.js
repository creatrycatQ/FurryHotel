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
  getOrderGuests, setOrderGuests, getRoomOccupants,
  getVerifiedUsers, getVerifiedUserById,
  getAllDeposits, getDepositById, getDepositByOrderId, createDeposit, refundDeposit, forfeitDeposit, deleteDepositByOrderId,
  getRoomTypeByName,
  getSystemSetting, setSystemSetting, getAllSettings,
  createInviteCode, getInviteCodes, updateInviteCodeStatus, deleteInviteCode,
  getPendingUsers, approveUser, rejectUser,
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
  // 附加每个房间的入住人员列表
  rooms.forEach(r => {
    r.occupants = getRoomOccupants(r.id);
  });
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

  // 退房：将房间设为 available 时，同步完成关联订单并退还押金
  if (status === 'available') {
    const activeOrders = db.prepare(
      `SELECT id FROM orders WHERE room_id = ? AND status IN ('confirmed', 'checked_in', 'pending', 'approved')`
    ).all(req.params.id);

    for (const order of activeOrders) {
      updateOrder(order.id, { status: 'completed' });
      const deposit = getDepositByOrderId(order.id);
      if (deposit && deposit.status === 'collected') {
        refundDeposit(deposit.id, req.user.id, '退房自动退还');
      }
    }
  }

  updateRoom(req.params.id, fields);
  res.json({ code: 200, message: '更新成功' });
});

router.delete('/rooms/:id', authMiddleware, (req, res) => {
  deleteRoom(req.params.id);
  res.json({ code: 200, message: '删除成功' });
});

// ========== 客人管理 ==========

router.get('/guests', authMiddleware, (req, res) => {
  const guests = getVerifiedUsers();
  res.json({ code: 200, data: guests });
});

router.get('/guests/:id', authMiddleware, (req, res) => {
  const guest = getVerifiedUserById(req.params.id);
  if (!guest) return res.status(404).json({ code: 404, message: '客人不存在' });
  res.json({ code: 200, data: guest });
});

router.put('/guests/:id', authMiddleware, (req, res) => {
  const { real_name, phone, id_card } = req.body;
  const fields = {};
  if (real_name !== undefined) fields.real_name = real_name;
  if (phone !== undefined) fields.phone = phone;
  if (id_card !== undefined) fields.id_card = id_card;
  updateUserInfo(req.params.id, fields);
  res.json({ code: 200, message: '更新成功' });
});

// ========== 订单管理 ==========

router.get('/orders', authMiddleware, (req, res) => {
  const orders = getAllOrders();
  res.json({ code: 200, data: orders });
});

router.get('/orders/:id', authMiddleware, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
  order.guest_users = getOrderGuests(req.params.id);
  res.json({ code: 200, data: order });
});

router.post('/orders', authMiddleware, (req, res) => {
  const { user_id, guest_name, guest_phone, room_id, total_price, remark, guest_user_ids } = req.body;
  if (!guest_name) return res.status(400).json({ code: 400, message: '客人姓名不能为空' });
  const result = createOrder({
    user_id: user_id || req.user.id,
    guest_name, guest_phone, room_id, total_price, remark
  });
  const orderId = result.lastInsertRowid;
  // 写入入住人员关联
  if (Array.isArray(guest_user_ids) && guest_user_ids.length > 0) {
    setOrderGuests(orderId, guest_user_ids);
  }
  res.json({ code: 201, message: '下单成功', data: { id: orderId } });
});

router.put('/orders/:id', authMiddleware, (req, res) => {
  const { guest_name, guest_phone, room_id, total_price, status, remark, user_id, guest_user_ids } = req.body;
  const fields = {};
  if (guest_name !== undefined) fields.guest_name = guest_name;
  if (guest_phone !== undefined) fields.guest_phone = guest_phone;
  if (room_id !== undefined) fields.room_id = room_id;
  if (total_price !== undefined) fields.total_price = total_price;
  if (status !== undefined) fields.status = status;
  if (remark !== undefined) fields.remark = remark;
  if (user_id !== undefined) fields.user_id = user_id;
  updateOrder(req.params.id, fields);

  // 更新入住人员关联
  if (Array.isArray(guest_user_ids)) {
    setOrderGuests(req.params.id, guest_user_ids);
  }

  // 订单状态变更时同步房间状态
  if (status !== undefined) {
    const order = getOrderById(req.params.id);
    if (order && order.room_id) {
      if (status === 'confirmed') {
        updateRoom(order.room_id, { status: 'occupied' });
      } else if (status === 'cancelled' || status === 'completed') {
        // 检查该房间是否还有其他活跃订单
        const activeOrders = db.prepare(
          `SELECT id FROM orders WHERE room_id = ? AND id != ? AND status IN ('pending', 'approved', 'confirmed')`
        ).all(order.room_id, order.id);
        if (activeOrders.length === 0) {
          updateRoom(order.room_id, { status: 'available' });
        }
      } else if (status === 'approved') {
        updateRoom(order.room_id, { status: 'reserved' });
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

  // 事务：释放房间 + 删除关联核验记录 + 删除押金 + 删除订单
  const deleteTransaction = db.transaction(() => {
    // 如果订单关联房间且处于活跃状态，释放房间
    if (order.room_id && (order.status === 'pending' || order.status === 'confirmed' || order.status === 'approved')) {
      const activeOrders = db.prepare(
        `SELECT id FROM orders WHERE room_id = ? AND id != ? AND status IN ('pending', 'approved', 'confirmed')`
      ).all(order.room_id, order.id);
      if (activeOrders.length === 0) {
        updateRoom(order.room_id, { status: 'available' });
      }
    }
    // 先删除关联的核验记录，避免外键约束失败
    db.prepare('DELETE FROM verifications WHERE order_id = ?').run(req.params.id);
    // 删除关联的押金记录
    deleteDepositByOrderId(req.params.id);
    deleteOrder(req.params.id);
  });

  deleteTransaction();
  res.json({ code: 200, message: '删除成功' });
});

// ========== 在线核验 ==========

router.post('/verify', authMiddleware, (req, res) => {
  const { order_id, result, note, deposit_amount } = req.body;
  if (!order_id) return res.status(400).json({ code: 400, message: '订单ID不能为空' });

  const order = getOrderById(order_id);
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });

  // 仅允许 approved 或 pending 状态的订单进行核验
  if (order.status === 'confirmed' || order.status === 'completed' || order.status === 'checked_in') {
    return res.status(400).json({ code: 400, message: '该订单已核验，无需重复操作' });
  }

  verifyOrder({ order_id, verified_by: req.user.id, result: result || 'success', note: note || '' });

  // 核验通过自动确认订单并将房间状态改为入住中
  if (result === 'success' || !result) {
    updateOrder(order_id, { status: 'confirmed' });
    if (order.room_id) {
      updateRoom(order.room_id, { status: 'occupied' });
    }

    // 手动收取押金（如果提供了金额且 > 0）
    if (deposit_amount && parseFloat(deposit_amount) > 0) {
      createDeposit({
        order_id: order.id,
        user_id: order.user_id,
        room_id: order.room_id || null,
        amount: parseFloat(deposit_amount),
        operator_id: req.user.id
      });
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
      if (order.room_id && (order.status === 'pending' || order.status === 'confirmed' || order.status === 'approved')) {
        const otherActive = db.prepare(
          `SELECT id FROM orders WHERE room_id = ? AND id != ? AND status IN ('pending', 'approved', 'confirmed')`
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
    basePrice: t.base_price, defaultDeposit: t.default_deposit || 0,
    description: t.description,
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
    basePrice: item.base_price, defaultDeposit: item.default_deposit || 0,
    description: item.description,
    created_at: item.created_at, updated_at: item.updated_at
  }});
});

// 新增房间类型
router.post('/room-types', authMiddleware, (req, res) => {
  const { name, label, basePrice, description, defaultDeposit } = req.body;
  const base_price = basePrice;
  const default_deposit = defaultDeposit || 0;
  if (!name || base_price == null) {
    return res.status(400).json({ code: 400, message: '名称和基础价格为必填项' });
  }
  try {
    const result = createRoomType({ name, label, base_price, description, default_deposit });
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
  const { name, label, basePrice, description, defaultDeposit } = req.body;
  const base_price = basePrice;
  const default_deposit = defaultDeposit != null ? defaultDeposit : undefined;
  try {
    updateRoomType(req.params.id, { name, label, base_price, description, default_deposit });
    // 若 name 变更，级联更新 rooms 表中引用该类型的记录
    if (name && name !== existing.name) {
      db.prepare('UPDATE rooms SET room_type = ? WHERE room_type = ?').run(name, existing.name);
    }
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

// ========== 系统设置 ==========

router.get('/settings', authMiddleware, (req, res) => {
  const settings = getAllSettings();
  const data = {};
  for (const s of settings) {
    data[s.key] = s.value;
  }
  res.json({ code: 200, data });
});

router.put('/settings', authMiddleware, (req, res) => {
  const { booking_open, session_timeout_minutes, site_title, site_subtitle, copyright_text, registration_mode } = req.body;
  if (booking_open !== undefined) {
    setSystemSetting('booking_open', booking_open ? '1' : '0');
  }
  if (session_timeout_minutes !== undefined) {
    const val = parseInt(session_timeout_minutes);
    if (isNaN(val) || val < 5 || val > 10080) {
      return res.status(400).json({ code: 400, message: '超时时间须在5-10080分钟之间' });
    }
    setSystemSetting('session_timeout_minutes', String(val));
  }
  if (site_title !== undefined) {
    setSystemSetting('site_title', String(site_title).trim() || 'FurryHotel');
  }
  if (site_subtitle !== undefined) {
    setSystemSetting('site_subtitle', String(site_subtitle).trim());
  }
  if (copyright_text !== undefined) {
    setSystemSetting('copyright_text', String(copyright_text).trim() || '© 2024 FurryHotel');
  }
  if (registration_mode !== undefined) {
    const validModes = ['open', 'closed', 'review', 'invite'];
    if (!validModes.includes(registration_mode)) {
      return res.status(400).json({ code: 400, message: '无效的注册模式' });
    }
    setSystemSetting('registration_mode', registration_mode);
  }
  res.json({ code: 200, message: '设置已更新' });
});

// ========== 邀请码管理 ==========

router.get('/invite-codes', authMiddleware, (req, res) => {
  const codes = getInviteCodes();
  res.json({ code: 200, data: codes });
});

router.post('/invite-codes', authMiddleware, (req, res) => {
  const crypto = require('crypto');
  const { count = 1, max_uses = 1, expires_hours } = req.body;
  const num = Math.min(Math.max(parseInt(count) || 1, 1), 50);
  const maxUses = Math.max(parseInt(max_uses) || 1, 1);
  const expiresAt = expires_hours ? new Date(Date.now() + parseInt(expires_hours) * 3600000).toISOString().replace('T', ' ').slice(0, 19) : null;

  const created = [];
  for (let i = 0; i < num; i++) {
    const code = crypto.randomBytes(6).toString('hex').toUpperCase();
    try {
      createInviteCode({ code, created_by: req.user.id, max_uses: maxUses, expires_at: expiresAt });
      created.push(code);
    } catch (e) {
      // 极低概率重复，跳过
    }
  }
  res.json({ code: 201, message: `已生成 ${created.length} 个邀请码`, data: created });
});

router.put('/invite-codes/:id', authMiddleware, (req, res) => {
  const { status } = req.body;
  if (!['active', 'disabled'].includes(status)) {
    return res.status(400).json({ code: 400, message: '状态值无效' });
  }
  updateInviteCodeStatus(req.params.id, status);
  res.json({ code: 200, message: '邀请码状态已更新' });
});

router.delete('/invite-codes/:id', authMiddleware, (req, res) => {
  deleteInviteCode(req.params.id);
  res.json({ code: 200, message: '邀请码已删除' });
});

// ========== 用户审核 ==========

router.get('/pending-users', authMiddleware, (req, res) => {
  const users = getPendingUsers();
  res.json({ code: 200, data: users });
});

router.post('/users/:id/approve', authMiddleware, (req, res) => {
  const user = findUserById(req.params.id);
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });
  if (user.status !== 'pending') {
    return res.status(400).json({ code: 400, message: '该用户不在待审核状态' });
  }
  approveUser(req.params.id);
  res.json({ code: 200, message: '用户已通过审核' });
});

router.post('/users/:id/reject', authMiddleware, (req, res) => {
  const user = findUserById(req.params.id);
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });
  if (user.status !== 'pending') {
    return res.status(400).json({ code: 400, message: '该用户不在待审核状态' });
  }
  rejectUser(req.params.id);
  res.json({ code: 200, message: '用户已被拒绝并删除' });
});

// ========== 订单审批 ==========

router.post('/orders/:id/approve', authMiddleware, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
  if (order.status !== 'pending') {
    return res.status(400).json({ code: 400, message: '只能审批待审批状态的订单' });
  }

  const { room_id, note } = req.body || {};
  let targetRoom;

  if (order.room_id) {
    // 订单已分配房间（后台手动创建），直接使用已有房间
    targetRoom = db.prepare('SELECT * FROM rooms WHERE id = ?').get(order.room_id);
    if (!targetRoom) {
      return res.status(400).json({ code: 400, message: '订单关联的房间不存在' });
    }
  } else if (room_id) {
    // 手动指定房间
    targetRoom = db.prepare('SELECT * FROM rooms WHERE id = ?').get(room_id);
    if (!targetRoom) {
      return res.status(400).json({ code: 400, message: '指定的房间不存在' });
    }
    if (targetRoom.status !== 'available') {
      return res.status(400).json({ code: 400, message: '指定的房间不可用' });
    }
  } else {
    // 自动分配
    const roomType = order.room_type;
    if (!roomType) {
      return res.status(400).json({ code: 400, message: '订单未指定房型，无法自动分配' });
    }
    targetRoom = db.prepare(
      `SELECT * FROM rooms WHERE room_type = ? AND status = 'available' ORDER BY floor, room_number LIMIT 1`
    ).get(roomType);
    if (!targetRoom) {
      return res.status(400).json({ code: 400, message: `房型「${roomType}」暂无可用房间，无法通过` });
    }
  }

  // 分配房间，确认订单
  const updateFields = {
    room_id: targetRoom.id,
    total_price: targetRoom.price,
    status: 'approved'
  };
  if (note) updateFields.remark = note;

  const approveTransaction = db.transaction(() => {
    updateOrder(order.id, updateFields);
    updateRoom(targetRoom.id, { status: 'reserved' });
  });

  approveTransaction();

  res.json({
    code: 200,
    message: '审批通过',
    data: { room_number: targetRoom.room_number, room_id: targetRoom.id, price: targetRoom.price }
  });
});

router.post('/orders/:id/reject', authMiddleware, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
  if (order.status !== 'pending') {
    return res.status(400).json({ code: 400, message: '只能拒绝待审批状态的订单' });
  }

  const { reason } = req.body || {};
  const updateFields = { status: 'cancelled' };
  if (reason) updateFields.reject_reason = reason;

  updateOrder(order.id, updateFields);
  res.json({ code: 200, message: '已拒绝该预约申请' });
});

// ========== 押金管理 ==========

// 手动为订单收取押金
router.post('/deposits', authMiddleware, (req, res) => {
  const { order_id, amount } = req.body;
  if (!order_id) return res.status(400).json({ code: 400, message: '订单ID不能为空' });
  if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ code: 400, message: '押金金额必须大于0' });

  const order = getOrderById(order_id);
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });

  // 检查是否已有押金
  const existing = getDepositByOrderId(order_id);
  if (existing) return res.status(400).json({ code: 400, message: '该订单已有押金记录' });

  createDeposit({
    order_id: order.id,
    user_id: order.user_id,
    room_id: order.room_id || null,
    amount: parseFloat(amount),
    operator_id: req.user.id
  });

  res.json({ code: 200, message: '押金收取成功' });
});

router.get('/deposits', authMiddleware, (req, res) => {
  const deposits = getAllDeposits();
  res.json({ code: 200, data: deposits });
});

router.get('/deposits/:id', authMiddleware, (req, res) => {
  const deposit = getDepositById(req.params.id);
  if (!deposit) return res.status(404).json({ code: 404, message: '押金记录不存在' });
  res.json({ code: 200, data: deposit });
});

router.put('/deposits/:id/refund', authMiddleware, (req, res) => {
  const deposit = getDepositById(req.params.id);
  if (!deposit) return res.status(404).json({ code: 404, message: '押金记录不存在' });
  if (deposit.status !== 'collected') return res.status(400).json({ code: 400, message: '该押金已处理，无法退还' });
  const { remark } = req.body;
  refundDeposit(req.params.id, req.user.id, remark || '');
  res.json({ code: 200, message: '退还成功' });
});

router.put('/deposits/:id/forfeit', authMiddleware, (req, res) => {
  const deposit = getDepositById(req.params.id);
  if (!deposit) return res.status(404).json({ code: 404, message: '押金记录不存在' });
  if (deposit.status !== 'collected') return res.status(400).json({ code: 400, message: '该押金已处理，无法扣除' });
  const { remark } = req.body;
  if (!remark || !remark.trim()) return res.status(400).json({ code: 400, message: '扣除押金必须填写原因' });
  forfeitDeposit(req.params.id, req.user.id, remark.trim());
  res.json({ code: 200, message: '扣除成功' });
});

module.exports = router;
