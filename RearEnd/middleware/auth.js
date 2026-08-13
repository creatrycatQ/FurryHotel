/**
 * 统一 Express 鉴权与权限控制中间件
 */

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const { findUserById } = require('../database');

/**
 * 基础 JWT 登录鉴权中间件
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未登录或 Token 缺失' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = findUserById(decoded.id);

    if (!user) {
      return res.status(401).json({ code: 401, message: '用户不存在' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ code: 403, message: '您的账号正在审核中，暂无法访问' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
  }
}

/**
 * 管理员权限校验中间件
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ code: 403, message: '权限不足，仅管理员可访问' });
  }
  next();
}

/**
 * 通用角色权限校验中间件工厂
 */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ code: 403, message: `权限不足，需要 [${role}] 角色` });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  requireAdmin,
  requireRole,
};
