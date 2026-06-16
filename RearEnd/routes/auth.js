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
router.get('/me', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ code: 401, message: '未登录' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = findUserById(decoded.id);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    // 打码身份证号和手机号
    const masked = { ...user };
    if (masked.id_card) {
      masked.id_card_masked = masked.id_card.slice(0, 4) + '**********' + masked.id_card.slice(-4);
    }
    if (masked.phone) {
      masked.phone_masked = masked.phone.slice(0, 3) + '****' + masked.phone.slice(-4);
    }
    // 标记是否已实名
    masked.verified = !!(user.real_name && user.id_card);

    return res.json({ code: 200, data: masked });
  } catch (err) {
    return res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
  }
});

/**
 * PUT /api/auth/profile
 * 更新用户实名信息
 */
router.put('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ code: 401, message: '未登录' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // 检查是否已实名，已实名不允许修改
    const existingUser = findUserById(decoded.id);
    if (existingUser && existingUser.real_name && existingUser.id_card) {
      return res.status(403).json({ code: 403, message: '已完成实名认证，无法修改' });
    }

    const { real_name, id_card, phone } = req.body;
    const sets = [];
    const vals = [];
    if (real_name !== undefined) { sets.push('real_name = ?'); vals.push(real_name); }
    if (id_card !== undefined) { sets.push('id_card = ?'); vals.push(id_card); }
    if (phone !== undefined) { sets.push('phone = ?'); vals.push(phone); }
    if (sets.length === 0) return res.status(400).json({ code: 400, message: '无更新内容' });
    sets.push("updated_at = datetime('now','localtime')");
    vals.push(decoded.id);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

    // 同步写入/更新 guests 表（关联 user_id）
    if (real_name || id_card || phone) {
      const updatedUser = findUserById(decoded.id);
      upsertGuestByUserId(decoded.id, {
        name: updatedUser.real_name || updatedUser.nickname || updatedUser.username,
        phone: updatedUser.phone || '',
        id_card: updatedUser.id_card || '',
      });
    }

    return res.json({ code: 200, message: '实名信息更新成功' });
  } catch (err) {
    return res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
  }
});

/**
 * DELETE /api/auth/account
 * 用户注销账号（级联删除关联数据）
 */
router.delete('/account', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ code: 401, message: '未登录' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = findUserById(decoded.id);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    // 级联删除关联数据
    db.prepare('DELETE FROM order_guests WHERE user_id = ?').run(decoded.id);
    db.prepare('DELETE FROM deposits WHERE user_id = ?').run(decoded.id);
    db.prepare('DELETE FROM verifications WHERE verified_by = ?').run(decoded.id);
    db.prepare('DELETE FROM orders WHERE user_id = ?').run(decoded.id);
    deleteGuestsByUserId(decoded.id);

    // 删除用户
    db.prepare('DELETE FROM users WHERE id = ?').run(decoded.id);

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
router.post('/refresh', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ code: 401, message: '未登录' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = findUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ code: 401, message: '用户不存在' });
    }

    // 签发新 token，保持原有 payload 结构
    const payload = { id: user.id, username: user.username };
    if (user.role === 'admin') payload.role = 'admin';

    const newToken = jwt.sign(payload, JWT_SECRET, { expiresIn: getTokenExpiry() });
    return res.json({ code: 200, data: { token: newToken } });
  } catch (err) {
    return res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
  }
});

module.exports = router;
