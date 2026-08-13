/**
 * 管理后台路由：仪表盘 / 门票席位 / 实名信息 / 门票订单 / 验票 / 用户
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const {
  getDashboardStats,
  getAllRooms, getRoomById, createRoom, updateRoom, deleteRoom,
  getAllGuests, getGuestById, createGuest, updateGuest, deleteGuest,
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
  getAllHotelRoomTypes, getHotelRoomTypeById, createHotelRoomType, updateHotelRoomType, deleteHotelRoomType,
  getAllStaffDeposits, getStaffDepositById, createStaffDeposit, refundStaffDeposit, forfeitStaffDeposit, deleteStaffDeposit,
  db,
} = require('../database');

const { authenticateToken, requireAdmin } = require('../middleware/auth');
const authMiddleware = [authenticateToken, requireAdmin];
const router = express.Router();

// ---------- 仪表盘 ----------
router.get('/dashboard', authMiddleware, (req, res) => {
  const stats = getDashboardStats();
  res.json({ code: 200, data: stats });
});

// ========== 门票席位管理 ==========

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
  if (!room) return res.status(404).json({ code: 404, message: '门票席位不存在' });
  res.json({ code: 200, data: room });
});

router.post('/rooms', authMiddleware, (req, res) => {
  const { room_number, room_type, floor, price, description } = req.body;
  if (!room_number) return res.status(400).json({ code: 400, message: '座位号/门票号不能为空' });
  try {
    const result = createRoom({ room_number, room_type: room_type || 'room_standard', floor: floor || 1, price: price || 0, description });
    res.json({ code: 201, message: '添加成功', data: { id: result.lastInsertRowid } });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ code: 409, message: '该座位号/门票号已存在' });
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

  // 释放：将席位设为 available 时，同步完成关联订单并退还押金
  if (status === 'available') {
    const activeOrders = db.prepare(
      `SELECT id FROM orders WHERE room_id = ? AND status IN ('confirmed', 'checked_in', 'pending', 'approved')`
    ).all(req.params.id);

    for (const order of activeOrders) {
      updateOrder(order.id, { status: 'completed' });
      const deposit = getDepositByOrderId(order.id);
      if (deposit && deposit.status === 'collected') {
        refundDeposit(deposit.id, req.user.id, '释放座位自动退还');
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
  if (!guest) return res.status(404).json({ code: 404, message: '实名用户不存在' });
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

// ========== 客人详情 (入住记录) 管理 ==========

router.get('/hotel-guests', authMiddleware, (req, res) => {
  const guests = getAllGuests();
  res.json({ code: 200, data: guests });
});

router.get('/hotel-guests/:id', authMiddleware, (req, res) => {
  const guest = getGuestById(req.params.id);
  if (!guest) return res.status(404).json({ code: 404, message: '客人详情不存在' });
  res.json({ code: 200, data: guest });
});

router.put('/hotel-guests/:id', authMiddleware, (req, res) => {
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

router.delete('/hotel-guests/:id', authMiddleware, (req, res) => {
  deleteGuest(req.params.id);
  res.json({ code: 200, message: '删除成功' });
});

router.post('/hotel-guests/sync', authMiddleware, (req, res) => {
  try {
    // 1. 获取所有有实名信息的普通用户
    const verifiedUsers = db.prepare(`
      SELECT id, real_name, phone, id_card 
      FROM users 
      WHERE real_name != '' AND id_card != '' AND role = 'guest'
    `).all();

    let importedCount = 0;
    let syncedCount = 0;

    const syncTransaction = db.transaction(() => {
      for (const u of verifiedUsers) {
        // 查找此人最新且有房间分配的活跃订单（对应订单管理中的房间号）
        const activeOrder = db.prepare(`
          SELECT room_id FROM orders 
          WHERE user_id = ? AND room_id IS NOT NULL AND status IN ('confirmed', 'checked_in', 'approved', 'pending')
          ORDER BY created_at DESC 
          LIMIT 1
        `).get(u.id);
        const roomId = activeOrder ? activeOrder.room_id : null;

        // 检查 guests 表中是否存在该 user_id 的记录
        const existing = db.prepare('SELECT id, name, phone, id_card, room_id FROM guests WHERE user_id = ?').get(u.id);
        if (!existing) {
          // 导入：创建一条客人记录，并同步写入房间号
          db.prepare(`
            INSERT INTO guests (user_id, name, phone, id_card, room_id, status)
            VALUES (?, ?, ?, ?, ?, 'checked_in')
          `).run(u.id, u.real_name, u.phone, u.id_card, roomId);
          importedCount++;
        } else {
          // 同步：如果基本资料或房间号发生变化，则更新
          if (existing.name !== u.real_name || existing.phone !== u.phone || existing.id_card !== u.id_card || existing.room_id !== roomId) {
            db.prepare(`
              UPDATE guests 
              SET name = ?, phone = ?, id_card = ?, room_id = ?, updated_at = datetime('now','localtime')
              WHERE id = ?
            `).run(u.real_name, u.phone, u.id_card, roomId, existing.id);
            syncedCount++;
          }
        }
      }
    });

    syncTransaction();
    res.json({ 
      code: 200, 
      message: `同步成功！新导入 ${importedCount} 名客人，更新了 ${syncedCount} 名已存在客人的信息（含所住房间）。` 
    });
  } catch (err) {
    console.error('同步客人信息失败:', err);
    res.status(500).json({ code: 500, message: '同步失败: ' + err.message });
  }
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
  const { user_id, guest_name, guest_phone, room_id, room_type, total_price, remark, guest_user_ids, guests } = req.body;
  if (!guest_name) return res.status(400).json({ code: 400, message: '持票人姓名不能为空' });

  const orderData = {
    user_id: user_id || req.user.id,
    guest_name,
    guest_phone,
    room_id,
    total_price,
    remark,
    guests: guests || (guest_user_ids && guest_user_ids.length ? guest_user_ids.length : 1)
  };

  if (room_type) {
    orderData.room_type = room_type;
  }

  const result = createOrder(orderData);
  const orderId = result.lastInsertRowid;

  // 写入入住人员关联
  if (Array.isArray(guest_user_ids) && guest_user_ids.length > 0) {
    setOrderGuests(orderId, guest_user_ids);
  }
  res.json({ code: 201, message: '下单成功', data: { id: orderId } });
});

router.put('/orders/:id', authMiddleware, (req, res) => {
  const { guest_name, guest_phone, room_id, room_type, total_price, status, remark, user_id, guest_user_ids } = req.body;

  const oldOrder = getOrderById(req.params.id);
  if (!oldOrder) return res.status(404).json({ code: 404, message: '订单不存在' });

  const fields = {};
  if (guest_name !== undefined) fields.guest_name = guest_name;
  if (guest_phone !== undefined) fields.guest_phone = guest_phone;
  if (room_id !== undefined) fields.room_id = room_id;
  if (room_type !== undefined) fields.room_type = room_type;
  if (total_price !== undefined) fields.total_price = total_price;
  if (status !== undefined) fields.status = status;
  if (remark !== undefined) fields.remark = remark;
  if (user_id !== undefined) fields.user_id = user_id;

  try {
    const updateOrderTx = db.transaction(() => {
      updateOrder(req.params.id, fields);

      // 更新入住人员关联
      if (Array.isArray(guest_user_ids)) {
        setOrderGuests(req.params.id, guest_user_ids);
      }

      const newOrder = getOrderById(req.params.id);

      // 1. 如果房间发生变更，同步更新新旧房间的状态
      if (oldOrder.room_id !== newOrder.room_id) {
        // 释放旧房
        if (oldOrder.room_id) {
          const activeOrdersOld = db.prepare(
            `SELECT id FROM orders WHERE room_id = ? AND id != ? AND status IN ('pending', 'approved', 'confirmed', 'checked_in')`
          ).all(oldOrder.room_id, req.params.id);
          if (activeOrdersOld.length === 0) {
            updateRoom(oldOrder.room_id, { status: 'available' });
          }
        }
        // 占用新房
        if (newOrder.room_id) {
          const targetRoomStatus = (newOrder.status === 'confirmed' || newOrder.status === 'checked_in') ? 'occupied' : 'reserved';
          updateRoom(newOrder.room_id, { status: targetRoomStatus });
        }
      }

      // 2. 如果仅仅是订单状态发生变更，同步更新当前房间状态
      if (status !== undefined && oldOrder.room_id === newOrder.room_id && newOrder.room_id) {
        if (status === 'confirmed' || status === 'checked_in') {
          updateRoom(newOrder.room_id, { status: 'occupied' });
        } else if (status === 'cancelled' || status === 'completed') {
          const activeOrders = db.prepare(
            `SELECT id FROM orders WHERE room_id = ? AND id != ? AND status IN ('pending', 'approved', 'confirmed', 'checked_in')`
          ).all(newOrder.room_id, newOrder.id);
          if (activeOrders.length === 0) {
            updateRoom(newOrder.room_id, { status: 'available' });
          }
        } else if (status === 'approved' || status === 'pending') {
          updateRoom(newOrder.room_id, { status: 'reserved' });
        }
      }
    });

    updateOrderTx();
    res.json({ code: 200, message: '更新成功' });
  } catch (err) {
    console.error('更新订单事务失败:', err);
    res.status(500).json({ code: 500, message: '更新订单失败' });
  }
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

  try {
    const verifyTx = db.transaction(() => {
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
    });

    verifyTx();
    res.json({ code: 200, message: '核验完成' });
  } catch (err) {
    console.error('核验事务失败:', err);
    res.status(500).json({ code: 500, message: '核验操作失败' });
  }
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
  const validRoles = ['guest', 'staff', 'admin'];
  const userRole = validRoles.includes(role) ? role : 'guest';
  const result = createUser({ username, password: hash, nickname: nickname || username, phone: phone || '', role: userRole });
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

// ==================== 门票类型管理 ====================

// 获取所有门票套餐类型
router.get('/room-types', authMiddleware, (req, res) => {
  const list = getAllRoomTypes().map(t => ({
    id: t.id, name: t.name, label: t.label,
    basePrice: t.base_price, defaultDeposit: t.default_deposit || 0,
    description: t.description,
    isRoomPackage: t.is_room_package === 1,
    hotelRoomType: t.hotel_room_type,
    stock: t.stock,
    created_at: t.created_at, updated_at: t.updated_at
  }));
  res.json({ code: 200, data: list });
});

// 获取单个门票套餐类型
router.get('/room-types/:id', authMiddleware, (req, res) => {
  try {
    console.log('[DEBUG] GET /room-types/:id - ID参数:', req.params.id);
    const item = getRoomTypeById(req.params.id);
    if (!item) {
      console.log('[DEBUG] 门票类型不存在，ID:', req.params.id);
      return res.status(404).json({ code: 404, message: '门票类型不存在' });
    }
    res.json({ code: 200, data: {
      id: item.id, name: item.name, label: item.label,
      basePrice: item.base_price, defaultDeposit: item.default_deposit || 0,
      description: item.description,
      isRoomPackage: item.is_room_package === 1,
      hotelRoomType: item.hotel_room_type,
      stock: item.stock,
      created_at: item.created_at, updated_at: item.updated_at
    }});
  } catch (err) {
    console.error('[ERROR] GET /room-types/:id 失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误: ' + err.message });
  }
});

// 新增门票套餐类型
router.post('/room-types', authMiddleware, (req, res) => {
  const { name, label, basePrice, description, defaultDeposit, isRoomPackage, hotelRoomType, stock } = req.body;
  const base_price = basePrice;
  const default_deposit = defaultDeposit || 0;
  const is_room_package = isRoomPackage ? 1 : 0;
  const stock_val = stock != null ? parseInt(stock) : 100;
  if (!name || base_price == null) {
    return res.status(400).json({ code: 400, message: '名称和基础价格为必填项' });
  }
  try {
    const result = createRoomType({ name, label, base_price, description, default_deposit, is_room_package, hotel_room_type: hotelRoomType || null, stock: stock_val });
    res.json({ code: 200, message: '创建成功', data: { id: result.lastInsertRowid } });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ code: 400, message: '门票类型名称已存在' });
    }
    res.status(500).json({ code: 500, message: '创建失败' });
  }
});

// 更新门票套餐类型
router.put('/room-types/:id', authMiddleware, (req, res) => {
  const existing = getRoomTypeById(req.params.id);
  if (!existing) return res.status(404).json({ code: 404, message: '门票类型不存在' });
  const { name, label, basePrice, description, defaultDeposit, isRoomPackage, hotelRoomType, stock } = req.body;
  const base_price = basePrice;
  const default_deposit = defaultDeposit != null ? defaultDeposit : undefined;
  const is_room_package = isRoomPackage !== undefined ? (isRoomPackage ? 1 : 0) : undefined;
  const stock_val = stock !== undefined ? parseInt(stock) : undefined;
  try {
    updateRoomType(req.params.id, { name, label, base_price, description, default_deposit, is_room_package, hotel_room_type: hotelRoomType, stock: stock_val });
    // 若 name 变更，级联更新 rooms 表中引用该类型的记录
    if (name && name !== existing.name) {
      db.prepare('UPDATE rooms SET room_type = ? WHERE room_type = ?').run(name, existing.name);
    }
    res.json({ code: 200, message: '更新成功' });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ code: 400, message: '门票类型名称已存在' });
    }
    res.status(500).json({ code: 500, message: '更新失败' });
  }
});

// 删除门票套餐类型
router.delete('/room-types/:id', authMiddleware, (req, res) => {
  const existing = getRoomTypeById(req.params.id);
  if (!existing) return res.status(404).json({ code: 404, message: '门票类型不存在' });

  // 检查该类型下是否有座位存在活跃订单（无法删除）
  const busyRooms = db.prepare(`
    SELECT r.room_number FROM rooms r
    WHERE r.room_type = ?
      AND EXISTS (
        SELECT 1 FROM orders o
        WHERE o.room_id = r.id AND o.status IN ('pending', 'approved', 'confirmed', 'checked_in')
      )
  `).all(existing.name);

  if (busyRooms.length > 0) {
    const nums = busyRooms.map(r => r.room_number).join('、');
    return res.status(400).json({ code: 400, message: `以下座位仍有活跃订单，无法删除：${nums}` });
  }

  // 检查是否有任何已存在的订单使用了该门票类型 (通过 room_type 字段关联)
  const orderCountByRoomType = db.prepare('SELECT COUNT(*) as c FROM orders WHERE room_type = ?').get(existing.name).c;

  if (orderCountByRoomType > 0) {
    return res.status(400).json({ code: 400, message: `该门票套餐下已有购票订单，无法删除！` });
  }

  // 级联删除该套餐下所有无活跃订单的座位，最后删除套餐类型
  const deleteTx = db.transaction(() => {
    db.prepare(`DELETE FROM rooms WHERE room_type = ?`).run(existing.name);
    deleteRoomType(req.params.id);
  });
  deleteTx();

  res.json({ code: 200, message: '删除成功' });
});


// ==================== 酒店客房房型管理 ====================

// 获取所有客房房型
router.get('/hotel-room-types', authMiddleware, (req, res) => {
  const list = getAllHotelRoomTypes().map(t => ({
    id: t.id, name: t.name, label: t.label,
    basePrice: t.base_price, defaultDeposit: t.default_deposit || 0,
    capacity: t.capacity || 2, description: t.description,
    created_at: t.created_at, updated_at: t.updated_at
  }));
  res.json({ code: 200, data: list });
});

// 获取单个客房房型
router.get('/hotel-room-types/:id', authMiddleware, (req, res) => {
  const item = getHotelRoomTypeById(req.params.id);
  if (!item) return res.status(404).json({ code: 404, message: '房型不存在' });
  res.json({ code: 200, data: {
    id: item.id, name: item.name, label: item.label,
    basePrice: item.base_price, defaultDeposit: item.default_deposit || 0,
    capacity: item.capacity || 2, description: item.description,
    created_at: item.created_at, updated_at: item.updated_at
  }});
});

// 新增客房房型
router.post('/hotel-room-types', authMiddleware, (req, res) => {
  const { name, label, basePrice, description, defaultDeposit, capacity } = req.body;
  if (!name || basePrice == null) {
    return res.status(400).json({ code: 400, message: '标识和价格为必填项' });
  }
  try {
    const result = createHotelRoomType({ name, label, base_price: basePrice, description, default_deposit: defaultDeposit || 0, capacity: capacity || 2 });
    res.json({ code: 200, message: '创建成功', data: { id: result.lastInsertRowid } });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ code: 400, message: '房型标识已存在' });
    }
    res.status(500).json({ code: 500, message: '创建失败' });
  }
});

// 更新客房房型
router.put('/hotel-room-types/:id', authMiddleware, (req, res) => {
  const existing = getHotelRoomTypeById(req.params.id);
  if (!existing) return res.status(404).json({ code: 404, message: '房型不存在' });
  const { name, label, basePrice, description, defaultDeposit, capacity } = req.body;
  try {
    updateHotelRoomType(req.params.id, { name, label, base_price: basePrice, description, default_deposit: defaultDeposit, capacity });
    // 若房型标识变更，同步级联更新 rooms 中的 room_type
    if (name && name !== existing.name) {
      db.prepare('UPDATE rooms SET room_type = ? WHERE room_type = ?').run(name, existing.name);
    }
    res.json({ code: 200, message: '更新成功' });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ code: 400, message: '房型标识已存在' });
    }
    res.status(500).json({ code: 500, message: '更新失败' });
  }
});

// 删除客房房型
router.delete('/hotel-room-types/:id', authMiddleware, (req, res) => {
  const existing = getHotelRoomTypeById(req.params.id);
  if (!existing) return res.status(404).json({ code: 404, message: '房型不存在' });

  // 检查该房型下是否有物理客房存在活跃订单
  const busyRooms = db.prepare(`
    SELECT r.room_number FROM rooms r
    WHERE r.room_type = ?
      AND EXISTS (
        SELECT 1 FROM orders o
        WHERE o.room_id = r.id AND o.status IN ('pending', 'approved', 'confirmed', 'checked_in')
      )
  `).all(existing.name);

  if (busyRooms.length > 0) {
    const nums = busyRooms.map(r => r.room_number).join('、');
    return res.status(400).json({ code: 400, message: `以下客房仍有活跃订单，无法删除：${nums}` });
  }

  // 级联删除该房型下所有无活跃订单的物理客房，再删除房型
  const deleteTx = db.transaction(() => {
    db.prepare(`DELETE FROM rooms WHERE room_type = ?`).run(existing.name);
    deleteHotelRoomType(req.params.id);
  });
  deleteTx();

  res.json({ code: 200, message: '删除成功（已同步清理关联客房）' });
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
  const { booking_open, staff_deposit_open, session_timeout_minutes, site_title, site_subtitle, copyright_text, registration_mode, max_tickets_per_user } = req.body;
  if (booking_open !== undefined) {
    setSystemSetting('booking_open', (booking_open === '1' || booking_open === 1 || booking_open === true) ? '1' : '0');
  }
  if (staff_deposit_open !== undefined) {
    setSystemSetting('staff_deposit_open', (staff_deposit_open === '1' || staff_deposit_open === 1 || staff_deposit_open === true) ? '1' : '0');
  }
  if (session_timeout_minutes !== undefined) {
    const val = parseInt(session_timeout_minutes);
    if (isNaN(val) || val < 5 || val > 10080) {
      return res.status(400).json({ code: 400, message: '超时时间须在5-10080分钟之间' });
    }
    setSystemSetting('session_timeout_minutes', String(val));
  }
  if (site_title !== undefined) {
    setSystemSetting('site_title', String(site_title).trim() || 'FurryEvent 电子售票核销系统');
  }
  if (site_subtitle !== undefined) {
    setSystemSetting('site_subtitle', String(site_subtitle).trim());
  }
  if (copyright_text !== undefined) {
    setSystemSetting('copyright_text', String(copyright_text).trim() || '© 2026 FurryEvent');
  }
  if (registration_mode !== undefined) {
    const validModes = ['open', 'closed', 'review', 'invite'];
    if (!validModes.includes(registration_mode)) {
      return res.status(400).json({ code: 400, message: '无效的注册模式' });
    }
    setSystemSetting('registration_mode', registration_mode);
  }
  if (max_tickets_per_user !== undefined) {
    const val = parseInt(max_tickets_per_user);
    if (isNaN(val) || val < 1) {
      return res.status(400).json({ code: 400, message: '购票张数上限须大于等于 1' });
    }
    setSystemSetting('max_tickets_per_user', String(val));
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

  // 1. 获取对应的门票套餐配置
  const typeObj = db.prepare('SELECT * FROM room_types WHERE name = ?').get(order.room_type);
  if (!typeObj) {
    return res.status(400).json({ code: 400, message: '订单关联的门票票档不存在' });
  }

  // 2. 确定需要关联的席位/物理客房类型
  const isRoomPkg = typeObj.is_room_package === 1;
  const targetType = isRoomPkg ? typeObj.hotel_room_type : typeObj.name;

  // 3. 进行席位分配和容量校验
  let targetRoom;
  const targetRoomId = room_id || order.room_id;

  if (targetRoomId) {
    // 手动指定房间或已分配房间：查出房间、最大容量及除了当前订单外的活跃人数和
    targetRoom = db.prepare(`
      SELECT r.*, COALESCE(rt.capacity, 1) as capacity,
             (SELECT COALESCE(SUM(o.guests), 0) FROM orders o WHERE o.room_id = r.id AND o.status IN ('approved', 'confirmed', 'checked_in', 'pending') AND o.id != ?) as current_occupants
      FROM rooms r
      LEFT JOIN hotel_room_types rt ON r.room_type = rt.name
      WHERE r.id = ?
    `).get(order.id, targetRoomId);

    if (!targetRoom) {
      return res.status(400).json({ code: 400, message: '指定的席位/客房不存在' });
    }
    if (targetRoom.room_type !== targetType) {
      return res.status(400).json({ code: 400, message: `类型不匹配：该套票需要关联「${targetType}」，而选择的是「${targetRoom.room_type}」` });
    }
    if (targetRoom.current_occupants + (order.guests || 1) > targetRoom.capacity) {
      return res.status(400).json({ code: 400, message: `容量不足：该席位/房间最多容纳 ${targetRoom.capacity}人，当前已预订/入住 ${targetRoom.current_occupants}人，本次订单有 ${order.guests || 1}人` });
    }
  } else {
    // 自动分配房间
    const rooms = db.prepare(`
      SELECT r.*, COALESCE(rt.capacity, 1) as capacity,
             (SELECT COALESCE(SUM(o.guests), 0) FROM orders o WHERE o.room_id = r.id AND o.status IN ('approved', 'confirmed', 'checked_in', 'pending')) as current_occupants
      FROM rooms r
      LEFT JOIN hotel_room_types rt ON r.room_type = rt.name
      WHERE r.room_type = ?
      ORDER BY r.floor, r.room_number
    `).all(targetType);

    targetRoom = rooms.find(rm => rm.current_occupants + (order.guests || 1) <= rm.capacity);
    if (!targetRoom) {
      return res.status(400).json({ code: 400, message: `类型「${targetType}」下暂无足够可用容量的席位/客房` });
    }
  }

  // 更新订单状态和房间状态
  const updateFields = {
    room_id: targetRoom.id,
    total_price: typeObj.base_price * (order.guests || 1),
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
    message: '审批通过，已成功分配房间',
    data: { room_number: targetRoom.room_number, room_id: targetRoom.id, price: typeObj.base_price * (order.guests || 1) }
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

// ========== STAFFS 押金管理 ==========

// 获取所有 STAFF 押金列表
router.get('/staff-deposits', authMiddleware, (req, res) => {
  const deposits = getAllStaffDeposits();
  res.json({ code: 200, data: deposits });
});

// 获取单个 STAFF 押金详情
router.get('/staff-deposits/:id', authMiddleware, (req, res) => {
  const deposit = getStaffDepositById(req.params.id);
  if (!deposit) return res.status(404).json({ code: 404, message: '押金记录不存在' });
  res.json({ code: 200, data: deposit });
});

// 手动收取 / 录入 STAFF 押金
router.post('/staff-deposits', authMiddleware, (req, res) => {
  const { user_id, amount, remark } = req.body;
  if (!user_id) return res.status(400).json({ code: 400, message: '请选择 STAFF 用户' });
  if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ code: 400, message: '押金金额必须大于0' });

  const staffUser = findUserById(user_id);
  if (!staffUser) return res.status(404).json({ code: 404, message: '选中的用户不存在' });

  createStaffDeposit({
    user_id,
    amount: parseFloat(amount),
    status: 'collected',
    remark: remark || '管理员手动收取STAFF押金',
    operator_id: req.user.id
  });

  res.json({ code: 201, message: 'STAFF 押金录入成功' });
});

// 退还 STAFF 押金
router.put('/staff-deposits/:id/refund', authMiddleware, (req, res) => {
  const deposit = getStaffDepositById(req.params.id);
  if (!deposit) return res.status(404).json({ code: 404, message: '押金记录不存在' });
  if (deposit.status !== 'collected') return res.status(400).json({ code: 400, message: '该押金已处理，无法退还' });
  const { remark } = req.body;
  refundStaffDeposit(req.params.id, req.user.id, remark || '退还STAFF押金');
  res.json({ code: 200, message: '退还成功' });
});

// 扣除 STAFF 押金
router.put('/staff-deposits/:id/forfeit', authMiddleware, (req, res) => {
  const deposit = getStaffDepositById(req.params.id);
  if (!deposit) return res.status(404).json({ code: 404, message: '押金记录不存在' });
  if (deposit.status !== 'collected') return res.status(400).json({ code: 400, message: '该押金已处理，无法扣除' });
  const { remark } = req.body;
  if (!remark || !remark.trim()) return res.status(400).json({ code: 400, message: '扣除押金必须填写原因' });
  forfeitStaffDeposit(req.params.id, req.user.id, remark.trim());
  res.json({ code: 200, message: '扣除成功' });
});

// 删除 STAFF 押金记录
router.delete('/staff-deposits/:id', authMiddleware, (req, res) => {
  const deposit = getStaffDepositById(req.params.id);
  if (!deposit) return res.status(404).json({ code: 404, message: '押金记录不存在' });
  deleteStaffDeposit(req.params.id);
  res.json({ code: 200, message: '删除成功' });
});

module.exports = router;
