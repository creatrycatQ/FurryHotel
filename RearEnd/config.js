/**
 * 统一配置模块
 */

const JWT_SECRET = process.env.JWT_SECRET || 'furry_hotel_secret_key_2024';
const JWT_EXPIRES_IN = '7d';

// 允许跨域的前端来源（生产环境应设置为实际域名）
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

// 启动时提示密钥风险
if (!process.env.JWT_SECRET) {
  console.warn('[警告] 未设置 JWT_SECRET 环境变量，正在使用默认密钥，仅限开发环境使用！');
}

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  CORS_ORIGINS,
};
