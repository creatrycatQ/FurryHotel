/**
 * 用户路由：个人订单查询（用于在线核验二维码展示）
 */

const express = require('express');

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
  getStaffDepositByUserId,
  createStaffDeposit,
  db,
} = require('../database');

const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ---------- 提交预约申请（创建订单，不分配房间） ----------
router.post('/orders', authenticateToken, (req, res) => {
  const { room_type, guest_name, guest_phone, remark, guests } = req.body;

  // 检查预定开关
  const bookingOpen = getSystemSetting('booking_open');
  if (bookingOpen !== '1') {
    return res.status(403).json({ code: 403, message: '预定暂未开放' });
  }

  // 基本校验
  if (!room_type) return res.status(400).json({ code: 400, message: '请选择房型' });
  if (!guest_name) return res.status(400).json({ code: 400, message: '请填写入住人姓名' });

  // 检查最大购票张数
  const ticketsToBuy = parseInt(guests) || 1;
  if (ticketsToBuy < 1) {
    return res.status(400).json({ code: 400, message: '购票张数必须大于0' });
  }

  const maxTicketsStr = getSystemSetting('max_tickets_per_user') || '1';
  const maxTickets = parseInt(maxTicketsStr, 10);

  // 检查该房型是否存在
  const typeExists = db.prepare(`SELECT name FROM room_types WHERE name = ?`).get(room_type);
  if (!typeExists) {
    return res.status(400).json({ code: 400, message: '所选房型不存在' });
  }

  try {
    // 事务处理：在事务内校验配额并创建订单，防并发超卖
    const orderTransaction = db.transaction(() => {
      const activeOrders = db.prepare(`SELECT SUM(guests) as total FROM orders WHERE user_id = ? AND status != 'cancelled'`).get(req.user.id);
      const currentTotal = activeOrders && activeOrders.total ? parseInt(activeOrders.total, 10) : 0;

      if (currentTotal + ticketsToBuy > maxTickets) {
        const err = new Error(`已超过购票上限。您最多只能购买 ${maxTickets} 张门票（包含已购）`);
        err.statusCode = 403;
        throw err;
      }

      return createOrder({
        user_id: req.user.id,
        guest_name,
        guest_phone: guest_phone || '',
        room_id: null,
        total_price: 0,
        remark: remark || '',
        room_type,
        guests: ticketsToBuy,
      });
    });

    const result = orderTransaction();

    res.json({
      code: 200,
      message: '预约申请已提交，请等待管理员审批',
      data: {
        order_id: result.lastInsertRowid,
        status: 'pending',
      },
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ code: err.statusCode, message: err.message });
    }
    console.error('下单服务异常:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ---------- 获取当前用户的订单列表 ----------
router.get('/orders', authenticateToken, (req, res) => {
  const orders = getOrdersByUserId(req.user.id);
  res.json({ code: 200, data: orders });
});

// ---------- 获取单个订单详情（须属于当前用户或为入住人） ----------
router.get('/orders/:id', authenticateToken, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
  // 检查是否为订单主人或入住人
  const myOrders = getOrdersByUserId(req.user.id);
  const hasAccess = myOrders.some(o => o.id === order.id);
  if (!hasAccess && req.user.role !== 'admin') {
    return res.status(403).json({ code: 403, message: '无权查看' });
  }
  // 附带核验状态
  const verification = getVerificationByOrder(order.id);
  res.json({ code: 200, data: { ...order, verification } });
});

// ---------- 扫码核验入住（管理员调用） ----------
router.post('/checkin', authenticateToken, (req, res) => {
  // 需要管理员角色
  if (req.user.role !== 'admin') {
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

  try {
    // 事务打包：记录核验、更新订单、更新房间、收取押金、创建客人记录
    const checkinTransaction = db.transaction(() => {
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
        user_id: order.user_id || null
      });
    });

    checkinTransaction();

    res.json({
      code: 200,
      message: '核验入住成功',
      data: {
        order_id: order.id,
        guest_name: order.guest_name,
        room_number: order.room_number || '待分配',
      },
    });
  } catch (err) {
    console.error('核验入住事务错误:', err);
    res.status(500).json({ code: 500, message: '核验失败，服务器内部错误' });
  }
});

// ---------- 获取当前 STAFF 用户的押金记录 ----------
router.get('/staff-deposit', authenticateToken, (req, res) => {
  if (req.user.role !== 'staff' && req.user.role !== 'admin') {
    return res.status(403).json({ code: 403, message: '仅 STAFF 角色可访问押金信息' });
  }
  const deposits = getStaffDepositByUserId(req.user.id);
  res.json({ code: 200, data: deposits });
});

// ---------- STAFF 用户在线缴纳押金 ----------
router.post('/staff-deposit/pay', authenticateToken, (req, res) => {
  if (req.user.role !== 'staff' && req.user.role !== 'admin') {
    return res.status(403).json({ code: 403, message: '仅 STAFF 角色可操作押金缴纳' });
  }

  // 检查管理员是否开启了 STAFF 押金入口
  const openVal = getSystemSetting('staff_deposit_open');
  if (openVal === '0') {
    return res.status(400).json({ code: 400, message: 'STAFF押金缴纳通道暂未开放，请等待管理员开启' });
  }

  const { amount, remark } = req.body;
  const payAmount = parseFloat(amount) > 0 ? parseFloat(amount) : 200;

  // 检查是否已有未退还/未扣除的押金
  const existing = getStaffDepositByUserId(req.user.id);
  const activeDeposit = existing.find(d => d.status === 'collected');
  if (activeDeposit) {
    return res.status(400).json({ code: 400, message: '您已有生效中的 STAFF 押金，无需重复缴纳' });
  }

  createStaffDeposit({
    user_id: req.user.id,
    amount: payAmount,
    status: 'collected',
    remark: remark || 'STAFF在线缴纳押金',
    operator_id: null,
  });

  res.json({ code: 200, message: 'STAFF 押金缴纳成功' });
});

module.exports = router;
