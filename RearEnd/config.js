/**
 * 统一配置模块
 */

const crypto = require('crypto');

// JWT 密钥：生产环境必须通过环境变量设置，开发环境回退为随机生成
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[警告] 未设置 JWT_SECRET 环境变量，使用随机密钥（重启后所有 token 失效）');
  console.warn('[警告] 生产环境请在 .env 中设置 JWT_SECRET');
}

const JWT_EXPIRES_IN = '7d';

// 允许跨域的前端来源（生产环境应设置为实际域名）
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  CORS_ORIGINS,
};
