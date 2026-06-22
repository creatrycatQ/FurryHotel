/**
 * FurryEvent 后端服务器入口
 * Node.js + Express + SQLite
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const { CORS_ORIGINS } = require('./config');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');

const app = express();
app.set('trust proxy', 1); // 信任一层代理（Cloudflare Tunnel）
const PORT = process.env.PORT || 3000;

// ---------- 中间件 ----------

// 安全响应头
app.use(helmet({
  contentSecurityPolicy: false, // 前端使用 CDN 和内联脚本，暂不启用 CSP
}));

// CORS 配置（开发环境允许所有来源，生产环境应设置 CORS_ORIGINS 环境变量）
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? CORS_ORIGINS : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 解析 JSON 请求体（限制 body 大小）
app.use(express.json({ limit: '1mb' }));

// 解析 URL 编码请求体
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// HTTP 请求日志
if (process.env.NODE_ENV === 'production') {
  // 生产环境：写入日志文件
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
  const accessLogStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });
  app.use(morgan('combined', { stream: accessLogStream }));
} else {
  // 开发环境：输出到控制台
  app.use(morgan('dev'));
}

// 登录/注册接口限流（防暴力破解）
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟窗口
  max: 5,              // 每 IP 最多 5 次
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '请求过于频繁，请 1 分钟后再试' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/admin-login', authLimiter);

// ---------- 静态文件：前端页面 ----------
const frontEndPath = path.join(__dirname, '..', 'FrontEnd');
app.use(express.static(frontEndPath));

// ---------- 路由 ----------

// 认证路由
app.use('/api/auth', authRoutes);

// 管理后台路由
app.use('/api/admin', adminRoutes);

// 用户路由（订单查询、核验入住）
app.use('/api/user', userRoutes);

// 公开接口：获取房间类型及可用数量（无需登录）
app.get('/api/room-types', (req, res) => {
  try {
    const { db, getAllRoomTypes } = require('./database');
    const types = getAllRoomTypes();
    
    // 1. 查询物理房间按房型的空闲数量
    const roomCounts = db
      .prepare(
        `SELECT room_type, COUNT(*) as available
         FROM rooms WHERE status = 'available'
         GROUP BY room_type`
      )
      .all();
    const roomCountMap = Object.fromEntries(roomCounts.map(r => [r.room_type, r.available]));

    // 2. 查询已订购（未退票）的门票订单的张数总和
    const soldCounts = db
      .prepare(
        `SELECT room_type, SUM(guests) as sold
         FROM orders WHERE status != 'cancelled'
         GROUP BY room_type`
      )
      .all();
    const soldMap = Object.fromEntries(soldCounts.map(r => [r.room_type, r.sold]));

    const result = types.map(t => {
      let available = 0;
      if (t.is_room_package === 1) {
        // 住宿套票套餐：余量由其绑定的物理房型的可用数量决定
        available = roomCountMap[t.hotel_room_type] || 0;
      } else {
        // 纯门票套餐：由票务总库存减去已售票数决定
        const sold = soldMap[t.name] || 0;
        available = Math.max(0, t.stock - sold);
      }
      return {
        id: t.id,
        name: t.name,
        label: t.label || t.name,
        basePrice: t.base_price,
        description: t.description || '',
        isRoomPackage: t.is_room_package === 1,
        hotelRoomType: t.hotel_room_type,
        stock: t.stock,
        available: available,
      };
    });
    res.json({ code: 200, data: result });
  } catch (err) {
    console.error('获取房间类型失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// 公开接口：获取可预订房间列表（无需登录）
app.get('/api/rooms/available', (req, res) => {
  try {
    const { db } = require('./database');
    const rooms = db.prepare(
      `SELECT r.id, r.room_number, r.room_type, r.floor, r.price, r.description,
              COALESCE(t.label, r.room_type) as type_label
       FROM rooms r
       LEFT JOIN room_types t ON r.room_type = t.name
       WHERE r.status = 'available'
       ORDER BY r.room_type, r.floor, r.room_number`
    ).all();
    res.json({ code: 200, data: rooms });
  } catch (err) {
    console.error('获取可用房间失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// 公开接口：查询预定是否开放（无需登录）
app.get('/api/settings/booking-status', (req, res) => {
  try {
    const { getSystemSetting } = require('./database');
    const value = getSystemSetting('booking_open');
    const maxVal = getSystemSetting('max_tickets_per_user') || '1';
    res.json({ code: 200, data: { open: value === '1', max_tickets_per_user: parseInt(maxVal) } });
  } catch (err) {
    console.error('获取预定状态失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// 公开接口：获取会话超时配置（无需登录，前端启动时拉取）
app.get('/api/settings/session-timeout', (req, res) => {
  try {
    const { getSystemSetting } = require('./database');
    const value = getSystemSetting('session_timeout_minutes');
    const minutes = parseInt(value) || 480;
    res.json({ code: 200, data: { timeout_minutes: minutes } });
  } catch (err) {
    console.error('获取会话超时配置失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// 公开接口：获取网站信息（标题、副标题、版权）
app.get('/api/settings/site-info', (req, res) => {
  try {
    const { getSystemSetting } = require('./database');
    const site_title = getSystemSetting('site_title') || 'FurryEvent';
    const site_subtitle = getSystemSetting('site_subtitle') || '大型狂欢沙龙活动，欢迎购票参加';
    const copyright_text = getSystemSetting('copyright_text') || '© 2026 FurryEvent';
    res.json({ code: 200, data: { site_title, site_subtitle, copyright_text } });
  } catch (err) {
    console.error('获取网站信息失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// 公开接口：获取注册模式（无需登录）
app.get('/api/settings/registration-mode', (req, res) => {
  try {
    const { getSystemSetting } = require('./database');
    const mode = getSystemSetting('registration_mode') || 'open';
    res.json({ code: 200, data: { mode } });
  } catch (err) {
    console.error('获取注册模式失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  const response = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
  // 仅开发环境暴露 uptime
  if (process.env.NODE_ENV !== 'production') {
    response.uptime = process.uptime();
  }
  res.json(response);
});

// 404 处理
app.use((req, res) => {
  // API 路由返回 JSON
  if (req.url.startsWith('/api')) {
    return res.status(404).json({
      code: 404,
      message: `接口不存在: ${req.method} ${req.url}`,
    });
  }
  // 非 .html 结尾或不存在的静态资源一律 404
  res.status(404).send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>404</title></head><body><h1>404 - 页面不存在</h1></body></html>');
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('[服务器错误]', err);
  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
  });
});

// ---------- 启动 ----------

const HOST = '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  const ipList = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ipList.push(net.address);
      }
    }
  }

  console.log('');
  console.log('========================================');
  console.log(`  FurryEvent Server Started`);
  console.log(`  ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log('========================================');
  console.log(`  Local:   http://localhost:${PORT}`);
  ipList.forEach(ip => {
    console.log(`  Network: http://${ip}:${PORT}`);
  });
  console.log('========================================');
  console.log('');
});

// ---------- 优雅关闭 ----------

function gracefulShutdown(signal) {
  console.log(`\n[${signal}] 正在关闭服务器...`);
  server.close(() => {
    console.log('HTTP 服务器已关闭');
    try {
      const { db } = require('./database');
      db.close();
      console.log('数据库连接已关闭');
    } catch (e) { /* ignore */ }
    process.exit(0);
  });
  // 超时强制退出
  setTimeout(() => {
    console.error('关闭超时，强制退出');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
