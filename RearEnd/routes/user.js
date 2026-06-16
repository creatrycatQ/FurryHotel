/**
 * 用户路由：个人订单查询（用于在线核验二维码展示）
 */

const express = require('express');
const jwt = require('jsonwebtoken');

const {
  getOrderById,
  createOrder,
  updateOrder,
  updateRoom,
  createGuest,
  getVerificationByOrder,
  verifyOrder,
  findUserById,
  getOrdersByUserId,
  getSystemSetting,
  createDeposit,
  db,
} = require('../database');

const { JWT_SECRET } = require('../config');

const router = express.Router();

// ---------- 鉴权中间件（普通用户） ----------
function userAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未登录' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
  }
}

// ---------- 提交预约申请（创建订单，不分配房间） ----------
router.post('/orders', userAuth, (req, res) => {
  const { room_type, guest_name, guest_phone, remark } = req.body;

  // 检查预定开关
  const bookingOpen = getSystemSetting('booking_open');
  if (bookingOpen !== '1') {
    return res.status(403).json({ code: 403, message: '预定暂未开放' });
  }

  // 基本校验
  if (!room_type) return res.status(400).json({ code: 400, message: '请选择房型' });
  if (!guest_name) return res.status(400).json({ code: 400, message: '请填写入住人姓名' });

  // 检查该房型是否存在
  const typeExists = db.prepare(`SELECT name FROM room_types WHERE name = ?`).get(room_type);
  if (!typeExists) {
    return res.status(400).json({ code: 400, message: '所选房型不存在' });
  }

  // 创建订单（不分配房间，等待管理员审批）
  const result = createOrder({
    user_id: req.user.id,
    guest_name,
    guest_phone: guest_phone || '',
    room_id: null,
    total_price: 0,
    remark: remark || '',
  });

  // 更新 room_type 字段
  updateOrder(result.lastInsertRowid, { room_type });

  res.json({
    code: 200,
    message: '预约申请已提交，请等待管理员审批',
    data: {
      order_id: result.lastInsertRowid,
      status: 'pending',
    },
  });
});

// ---------- 获取当前用户的订单列表 ----------
router.get('/orders', userAuth, (req, res) => {
  const orders = getOrdersByUserId(req.user.id);
  res.json({ code: 200, data: orders });
});

// ---------- 获取单个订单详情（须属于当前用户或为入住人） ----------
router.get('/orders/:id', userAuth, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
  // 检查是否为订单主人或入住人
  const myOrders = getOrdersByUserId(req.user.id);
  const hasAccess = myOrders.some(o => o.id === order.id);
  if (!hasAccess) {
    return res.status(403).json({ code: 403, message: '无权查看' });
  }
  // 附带核验状态
  const verification = getVerificationByOrder(order.id);
  res.json({ code: 200, data: { ...order, verification } });
});

// ---------- 扫码核验入住（管理员调用） ----------
router.post('/checkin', userAuth, (req, res) => {
  // 需要管理员角色
  const user = findUserById(req.user.id);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ code: 403, message: '权限不足，仅管理员可执行核验入住' });
  }

  const { order_id, deposit_amount } = req.body;
  if (!order_id) return res.status(400).json({ code: 400, message: '订单ID不能为空' });

  const order = getOrderById(order_id);
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });

  if (order.status === 'checked_in') {
    return res.status(400).json({ code: 400, message: '该订单已完成入住，无需重复核验' });
  }
  if (order.status === 'cancelled') {
    return res.status(400).json({ code: 400, message: '该订单已取消，无法核验入住' });
  }

  // 1. 记录核验
  verifyOrder({ order_id, verified_by: req.user.id, result: 'success', note: '扫码核验入住' });

  // 2. 更新订单状态为 checked_in
  updateOrder(order_id, { status: 'checked_in' });

  // 3. 如果订单关联了房间，将房间状态设为 occupied
  if (order.room_id) {
    updateRoom(order.room_id, { status: 'occupied' });
  }

  // 4. 手动收取押金（如果提供了金额且 > 0）
  if (deposit_amount && parseFloat(deposit_amount) > 0) {
    createDeposit({
      order_id: order.id,
      user_id: order.user_id,
      room_id: order.room_id || null,
      amount: parseFloat(deposit_amount),
      operator_id: req.user.id
    });
  }

  // 5. 创建入住客人记录
  createGuest({
    name: order.guest_name,
    phone: order.guest_phone || '',
    id_card: '',
    room_id: order.room_id || null,
    check_in: new Date().toISOString().slice(0, 19).replace('T', ' '),
  });

  res.json({
    code: 200,
    message: '核验入住成功',
    data: {
      order_id: order.id,
      guest_name: order.guest_name,
      room_number: order.room_number || '待分配',
    },
  });
});

module.exports = router;
