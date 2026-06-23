# FurryHotel 酒店管理系统 🐾

一个功能完整的 Furry 主题酒店在线预订与管理系统，支持用户注册/登录、房间预订、订单管理、门票购买和全方位的管理后台功能。

## ✨ 技术栈

- **前端**：HTML5 / CSS3 / JavaScript（原生）
- **后端**：Node.js + Express.js
- **数据库**：SQLite3（better-sqlite3）
- **安全**：Helmet、JWT 认证、bcryptjs 密码加密、速率限制
- **日志**：Morgan 日志记录
- **部署**：支持 Cloudflare Tunnel

## 📁 项目结构

```
FurryHotel/
├── FrontEnd/                    # 前端页面
│   ├── index.html               # 首页/登录
│   ├── register.html            # 用户注册
│   ├── verify.html              # 身份验证
│   ├── id-verify.html           # ID 验证页
│   ├── home.html                # 用户主页
│   ├── rooms.html               # 房间浏览
│   ├── reserve.html             # 房间预订
│   ├── orders.html              # 订单管理
│   ├── tickets.html             # 门票购买
│   ├── admin-login.html         # 管理员登录
│   ├── admin.html               # 管理后台首页
│   ├── admin-users.html         # 用户管理
│   ├── admin-guests.html        # 客人管理
│   ├── admin-guest-details.html # 客人详情
│   ├── admin-orders.html        # 订单管理
│   ├── admin-rooms.html         # 房间管理
│   ├── admin-room-types.html    # 房型管理
│   ├── admin-hotel-room-types.html # 酒店房型配置
│   ├── admin-deposit.html       # 存款管理
│   ├── admin-invite-codes.html  # 邀请码管理
│   ├── admin-scan.html          # 扫码验票
│   ├── admin-verify.html        # 管理员验证
│   ├── admin-settings.html      # 系统设置
│   ├── css/                     # 样式文件
│   └── js/                      # 脚本文件
│       └── app.js               # 主应用逻辑
├── RearEnd/                     # 后端服务
│   ├── server.js                # 服务器入口
│   ├── config.js                # 配置文件
│   ├── database.js              # 数据库初始化与种子数据
│   ├── routes/                  # API 路由模块
│   │   ├── auth.js              # 认证相关接口
│   │   ├── admin.js             # 管理员接口
│   │   └── user.js              # 用户接口
│   ├── 启动.bat                 # Windows 快速启动脚本
│   ├── 重置数据库.bat           # 数据库重置工具
│   └── package.json             # 依赖配置
└── .gitignore
```

## 🎯 功能特性

### 用户端功能
- ✅ 用户注册与登录（JWT 令牌认证）
- ✅ 身份验证与 ID 验证流程
- ✅ 房间浏览与在线预订
- ✅ 订单查看与管理
- ✅ 门票购买系统
- ✅ 用户个人中心

### 管理后台功能
- ✅ **用户管理**：查看、编辑、删除用户账号
- ✅ **客人管理**：客人信息管理与详情查看
- ✅ **订单管理**：订单审核、状态更新、退款处理
- ✅ **房间管理**：房间信息维护、可用性控制
- ✅ **房型管理**：房型配置、价格设置
- ✅ **存款管理**：用户存款记录与审核
- ✅ **邀请码系统**：生成、分发、管理邀请码
- ✅ **扫码验票**：现场扫码验证订单/门票
- ✅ **系统设置**：全局配置管理

### 安全特性
- 🔒 JWT 认证保护 API 端点
- 🔒 bcryptjs 密码加密存储
- 🔒 速率限制防止暴力破解（登录/注册限流）
- 🔒 Helmet 安全响应头
- 🔒 CORS 跨域安全配置
- 🔒 请求体大小限制（1MB）

## 🚀 快速开始

### 环境要求

- Node.js >= 16.x
- npm 或 yarn

### 安装与运行

#### 方法一：使用启动脚本（推荐 Windows 用户）

```bash
# 双击运行或在命令行执行
RearEnd\启动.bat
```

脚本会自动：
- 检查并安装依赖
- 检查 3000 端口占用情况
- 初始化数据库并填充种子数据
- 启动服务器

#### 方法二：手动启动

```bash
# 1. 进入后端目录
cd RearEnd

# 2. 安装依赖
npm install

# 3. 创建 .env 文件（参考下方配置）
cp .env.example .env

# 4. 启动服务
npm start
```

### 环境变量配置

在 `RearEnd/.env` 中配置：

```env
PORT=3000
JWT_SECRET=your_secure_jwt_secret_key_here_change_in_production
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000
```

> ⚠️ **生产环境请务必修改 `JWT_SECRET` 为强密码**

### 数据库管理

#### 初始化/重置数据库

```bash
# Windows 用户直接运行
RearEnd\重置数据库.bat

# 或手动执行
cd RearEnd
node database.js
```

重置后会自动创建：
- 测试用户账号
- 示例房型和房间
- 管理员账号（见下方默认账号）

### 访问系统

启动成功后：

- **用户端首页**：`http://localhost:3000` 或 `http://localhost:3000/index.html`
- **管理后台登录**：`http://localhost:3000/admin-login.html`
- **API 基础地址**：`http://localhost:3000/api`

### 默认账号

#### 管理员账号
- 用户名：`admin`
- 密码：`admin123`（生产环境请立即修改）

#### 测试用户账号
- 查看 `RearEnd/database.js` 中的种子数据

## 📡 API 端点

### 认证接口 (`/api/auth`)
- `POST /register` - 用户注册
- `POST /login` - 用户登录
- `POST /admin-login` - 管理员登录
- `GET /verify-token` - 验证 JWT 令牌

### 用户接口 (`/api/user`)
- `GET /profile` - 获取用户信息
- `GET /orders` - 获取用户订单列表
- `POST /orders` - 创建订单

### 管理接口 (`/api/admin`)
- `GET /users` - 获取用户列表
- `GET /orders` - 获取所有订单
- `PUT /orders/:id` - 更新订单状态
- `GET /rooms` - 获取房间列表
- `POST /rooms` - 创建房间
- `GET /stats` - 获取统计数据

> 完整 API 文档请查看各路由文件：`RearEnd/routes/`

## 🛠️ 开发指南

### 项目技术选型说明

- 使用原生 JavaScript 开发前端，无需构建工具，方便快速部署
- SQLite 数据库无需额外安装，适合中小型项目
- Express.js 轻量级框架，易于扩展

### 添加新功能

1. 前端：在 `FrontEnd/` 中创建新的 HTML 页面
2. 后端路由：在 `RearEnd/routes/` 中添加路由模块
3. 数据库：在 `RearEnd/database.js` 中添加表结构

### 日志查看

- 开发环境：日志输出到控制台
- 生产环境：日志保存在 `RearEnd/logs/access.log`

## 🔒 安全建议

1. **修改默认密码**：生产环境立即修改管理员密码
2. **更换 JWT_SECRET**：使用强随机密钥
3. **配置 CORS**：生产环境限制允许的源
4. **HTTPS**：使用 SSL 证书（推荐 Cloudflare Tunnel）
5. **定期备份**：定期备份 SQLite 数据库文件

## 📝 待办事项 / Roadmap

- [ ] 添加支付接口集成
- [ ] 实现邮件通知系统
- [ ] 添加数据统计图表
- [ ] 移动端响应式优化
- [ ] Docker 容器化部署

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License - 查看 [LICENSE](LICENSE) 文件了解详情

---

Made with 💜 for the Furry community
