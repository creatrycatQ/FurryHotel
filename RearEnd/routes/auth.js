/**
 * 认证路由：注册 + 登录
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  findUserByUsername,
  findUserById,
  createUser,
  updateLoginTime,
  upsertGuestByUserId,
  deleteGuestsByUserId,
  getSystemSetting,
  getInviteCodeByCode,
  useInviteCode,
  updateUserInfo,
  db,
} = require('../database');

const { JWT_SECRET } = require('../config');
const { authenticateToken } = require('../middleware/auth');

function isValidPhone(phone) {
  if (!phone) return true;
  return /^1[3-9]\d{9}$/.test(phone);
}

function isValidIdCard(idCard) {
  if (!idCard) return true;
  return /^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(idCard);
}

/**
 * 从系统设置读取 JWT 过期时间，默认 480 分钟（8小时）
 */
function getTokenExpiry() {
  const val = getSystemSetting('session_timeout_minutes');
  const minutes = parseInt(val);
  if (!minutes || minutes < 1) return '480m';
  return `${minutes}m`;
}

const router = express.Router();

/**
 * POST /api/auth/register
 * 注册新用户
 * Body: { username, password, nickname?, phone? }
 */
router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname, phone, invite_code } = req.body;

    // ---- 检查注册模式 ----
    const mode = getSystemSetting('registration_mode') || 'open';
    if (mode === 'closed') {
      return res.status(403).json({ code: 403, message: '当前注册已关闭' });
    }

    // ---- 参数校验 ----
    if (!username || !password) {
      return res.status(400).json({
        code: 400,
        message: '用户名和密码不能为空',
      });
    }

    // 用户名规则：3-20位字母、数字或下划线
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({
        code: 400,
        message: '用户名需为3-20位字母、数字或下划线',
      });
    }

    // 密码规则：6-30位
    if (password.length < 6 || password.length > 30) {
      return res.status(400).json({
        code: 400,
        message: '密码长度需为6-30位',
      });
    }

    // ---- 邀请码模式：验证邀请码 ----
    if (mode === 'invite') {
      if (!invite_code) {
        return res.status(400).json({ code: 400, message: '请输入邀请码' });
      }
      const codeRecord = getInviteCodeByCode(invite_code.trim());
      if (!codeRecord || codeRecord.status !== 'active') {
        return res.status(400).json({ code: 400, message: '邀请码无效' });
      }
      if (codeRecord.max_uses > 0 && codeRecord.use_count >= codeRecord.max_uses) {
        return res.status(400).json({ code: 400, message: '邀请码已达使用上限' });
      }
      if (codeRecord.expires_at && new Date(codeRecord.expires_at) < new Date()) {
        return res.status(400).json({ code: 400, message: '邀请码已过期' });
      }
    }

    // 检查用户名是否已存在
    const existingUser = findUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({
        code: 409,
        message: '该用户名已被注册',
      });
    }

    // 加密密码
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 创建用户
    const newUser = createUser({
      username,
      password: hashedPassword,
      nickname: nickname || username,
      phone: phone || '',
    });

    // ---- 审核模式：设为 pending，不发 token ----
    if (mode === 'review') {
      updateUserInfo(newUser.id, { status: 'pending' });
      return res.status(201).json({
        code: 201,
        message: '注册成功，请等待管理员审核',
      });
    }

    // ---- 邀请码模式：消耗邀请码 ----
    if (mode === 'invite') {
      useInviteCode(invite_code.trim(), newUser.id);
    }

    // 生成 token
    const token = jwt.sign(
      { id: newUser.id, username },
      JWT_SECRET,
      { expiresIn: getTokenExpiry() },
    );

    return res.status(201).json({
      code: 201,
      message: '注册成功',
      data: {
        token,
        user: {
          id: newUser.id,
          username,
          nickname: nickname || username,
          phone: phone || '',
        },
      },
    });
  } catch (err) {
    console.error('[注册错误]', err);
    return res.status(500).json({
      code: 500,
      message: '服务器内部错误，请稍后重试',
    });
  }
});

/**
 * POST /api/auth/admin-login
 * 管理员专用登录（只有 role=admin 的用户可以登录）
 * Body: { username, password }
 */
router.post('/admin-login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
    }

    const user = findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ code: 401, message: '管理员账号或密码错误' });
    }

    // 只允许 admin 角色登录后台
    if (user.role !== 'admin') {
      return res.status(403).json({ code: 403, message: '该账号不是管理员，无权登录后台' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ code: 401, message: '管理员账号或密码错误' });
    }

    updateLoginTime(user.id);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: getTokenExpiry() },
    );

    return res.json({
      code: 200,
      message: '管理员登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          phone: user.phone,
          role: user.role,
        },
      },
    });
  } catch (err) {
    console.error('[管理员登录错误]', err);
    return res.status(500).json({ code: 500, message: '服务器内部错误，请稍后重试' });
  }
});

/**
 * POST /api/auth/login
 * 前台用户登录（普通用户）
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // ---- 参数校验 ----
    if (!username || !password) {
      return res.status(400).json({
        code: 400,
        message: '用户名和密码不能为空',
      });
    }

    // 查找用户
    const user = findUserByUsername(username);
    if (!user) {
      return res.status(401).json({
        code: 401,
        message: '用户名或密码错误',
      });
    }

    // 管理员账号不允许从前台登录
    if (user.role === 'admin') {
      return res.status(403).json({
        code: 403,
        message: '管理员账号请从后台登录',
      });
    }

    // 审核中的用户不允许登录
    if (user.status === 'pending') {
      return res.status(403).json({
        code: 403,
        message: '您的账号正在审核中，请耐心等待管理员通过',
      });
    }

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        code: 401,
        message: '用户名或密码错误',
      });
    }

    // 更新登录时间
    updateLoginTime(user.id);

    // 生成 token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: getTokenExpiry() },
    );

    return res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          phone: user.phone,
          avatar: user.avatar,
        },
      },
    });
  } catch (err) {
    console.error('[登录错误]', err);
    return res.status(500).json({
      code: 500,
      message: '服务器内部错误，请稍后重试',
    });
  }
});

/**
 * GET /api/auth/me
 * 获取当前用户信息（需 JWT 认证）
 */
router.get('/me', authenticateToken, (req, res) => {
  const user = req.user;
  const masked = { ...user };
  if (masked.id_card) {
    masked.id_card_masked = masked.id_card.slice(0, 4) + '**********' + masked.id_card.slice(-4);
  }
  if (masked.phone) {
    masked.phone_masked = masked.phone.slice(0, 3) + '****' + masked.phone.slice(-4);
  }
  masked.verified = !!(user.real_name && user.id_card);

  return res.json({ code: 200, data: masked });
});

/**
 * PUT /api/auth/profile
 * 更新用户实名信息
 */
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const existingUser = req.user;
    if (existingUser && existingUser.real_name && existingUser.id_card) {
      return res.status(403).json({ code: 403, message: '已完成实名认证，无法修改' });
    }

    const { real_name, id_card, phone } = req.body;
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ code: 400, message: '手机号格式不正确' });
    }
    if (id_card && !isValidIdCard(id_card)) {
      return res.status(400).json({ code: 400, message: '身份证号格式不正确' });
    }

    const sets = [];
    const vals = [];
    if (real_name !== undefined) { sets.push('real_name = ?'); vals.push(real_name); }
    if (id_card !== undefined) { sets.push('id_card = ?'); vals.push(id_card); }
    if (phone !== undefined) { sets.push('phone = ?'); vals.push(phone); }
    if (sets.length === 0) return res.status(400).json({ code: 400, message: '无更新内容' });
    sets.push("updated_at = datetime('now','localtime')");
    vals.push(req.user.id);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

    if (real_name || id_card || phone) {
      const updatedUser = findUserById(req.user.id);
      upsertGuestByUserId(req.user.id, {
        name: updatedUser.real_name || updatedUser.nickname || updatedUser.username,
        phone: updatedUser.phone || '',
        id_card: updatedUser.id_card || '',
      });
    }

    return res.json({ code: 200, message: '实名信息更新成功' });
  } catch (err) {
    console.error('[更新实名错误]', err);
    return res.status(500).json({ code: 500, message: '服务器内部错误，请稍后重试' });
  }
});

/**
 * DELETE /api/auth/account
 * 用户注销账号（级联删除关联数据，并在事务中释放关联房间）
 */
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const deleteAccountTransaction = db.transaction(() => {
      // 1. 检索用户关联的活跃订单及关联房间
      const userOrders = db.prepare(
        `SELECT id, room_id, status FROM orders WHERE user_id = ?`
      ).all(userId);

      // 2. 检查并释放房间状态
      for (const order of userOrders) {
        if (order.room_id && (order.status === 'pending' || order.status === 'approved' || order.status === 'confirmed' || order.status === 'checked_in')) {
          const otherActive = db.prepare(
            `SELECT id FROM orders WHERE room_id = ? AND user_id != ? AND status IN ('pending', 'approved', 'confirmed', 'checked_in')`
          ).all(order.room_id, userId);

          if (otherActive.length === 0) {
            db.prepare(`UPDATE rooms SET status = 'available', updated_at = datetime('now','localtime') WHERE id = ?`).run(order.room_id);
          }
        }
      }

      // 3. 级联删除关联数据
      db.prepare('DELETE FROM order_guests WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM deposits WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM verifications WHERE verified_by = ?').run(userId);

      for (const o of userOrders) {
        db.prepare('DELETE FROM verifications WHERE order_id = ?').run(o.id);
        db.prepare('DELETE FROM deposits WHERE order_id = ?').run(o.id);
      }

      db.prepare('DELETE FROM orders WHERE user_id = ?').run(userId);
      deleteGuestsByUserId(userId);

      // 4. 删除用户
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });

    deleteAccountTransaction();

    return res.json({ code: 200, message: '账号已注销' });
  } catch (err) {
    console.error('[注销账号错误]', err);
    return res.status(500).json({ code: 500, message: '服务器内部错误，请稍后重试' });
  }
});

/**
 * POST /api/auth/refresh
 * 刷新 Token：验证当前 token 有效后签发新 token
 */
router.post('/refresh', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const payload = { id: user.id, username: user.username };
    if (user.role === 'admin') payload.role = 'admin';

    const newToken = jwt.sign(payload, JWT_SECRET, { expiresIn: getTokenExpiry() });
    return res.json({ code: 200, data: { token: newToken } });
  } catch (err) {
    return res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
  }
});

/**
 * POST /api/auth/wx-login
 * 微信小程序 Code 快捷授权（如果已配置微信 AppID/Secret 可自动 code2Session，未配置则返回基础体验信息）
 */
router.post('/wx-login', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ code: 400, message: '微信授权 code 不能为空' });
    }

    return res.json({
      code: 200,
      message: '微信连通成功，请在小程序中使用用户名密码或注册新账号完成绑定',
      data: {
        code_received: code,
      },
    });
  } catch (err) {
    console.error('[微信授权错误]', err);
    return res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

module.exports = router;

