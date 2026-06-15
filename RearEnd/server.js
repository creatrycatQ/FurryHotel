/**
 * FurryHotel 后端服务器入口
 * Node.js + Express + SQLite
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const { CORS_ORIGINS } = require('./config');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- 中间件 ----------

// CORS 配置（开发环境允许所有来源，生产环境应设置 CORS_ORIGINS 环境变量）
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? CORS_ORIGINS : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 解析 JSON 请求体
app.use(express.json());

// 解析 URL 编码请求体
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, res, next) => {
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

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
    // 查询每种类型的可用房间数
    const counts = db
      .prepare(
        `SELECT room_type, COUNT(*) as available
         FROM rooms WHERE status = 'available'
         GROUP BY room_type`
      )
      .all();
    const countMap = Object.fromEntries(counts.map(r => [r.room_type, r.available]));
    const result = types.map(t => ({
      id: t.id,
      name: t.name,
      label: t.label || t.name,
      base_price: t.base_price,
      available: countMap[t.name] || 0,
    }));
    res.json({ code: 200, data: result });
  } catch (err) {
    console.error('获取房间类型失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
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

app.listen(PORT, HOST, () => {
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
  console.log(`  FurryHotel Server Started`);
  console.log('========================================');
  console.log(`  Local:   http://localhost:${PORT}`);
  ipList.forEach(ip => {
    console.log(`  Network: http://${ip}:${PORT}`);
  });
  console.log('========================================');
  console.log('');
});

module.exports = app;
