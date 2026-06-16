# FurryHotel 酒店管理系统

一个面向 Furry 主题酒店的在线预订与管理系统，包含用户注册/登录、房间预订、订单管理和后台管理功能。

## 技术栈

- **前端**：HTML / CSS / JavaScript（原生）
- **后端**：Node.js + Express
- **数据库**：SQLite（better-sqlite3）
- **安全**：Helmet、JWT 认证、bcrypt 密码加密、速率限制
- **部署**：Cloudflare Tunnel

## 项目结构

```
FurryHotel/
├── FrontEnd/               # 前端页面
│   ├── index.html          # 首页/登录
│   ├── register.html       # 用户注册
│   ├── verify.html         # 身份验证
│   ├── home.html           # 用户主页
│   ├── rooms.html          # 房间浏览
│   ├── reserve.html        # 房间预订
│   ├── orders.html         # 订单管理
│   ├── admin.html          # 管理后台
│   ├── admin-login.html    # 管理员登录
│   ├── admin-scan.html     # 管理员扫码
│   ├── id-verify.html      # 身份验证页
│   ├── css/                # 样式文件
│   └── js/                 # 脚本文件
├── RearEnd/                # 后端服务
│   ├── server.js           # 服务器入口
│   ├── database.js         # 数据库初始化
│   ├── routes/             # API 路由
│   │   ├── auth.js         # 认证相关接口
│   │   └── admin.js        # 管理员接口
│   ├── start.bat           # Windows 启动脚本
│   └── package.json        # 依赖配置
└── .gitignore
```

## 功能特性

- 用户注册与登录（JWT 令牌认证）
- 身份验证流程
- 房间浏览与在线预订
- 订单查看与管理
- 管理员后台（用户管理、订单审核）
- 速率限制防止滥用
- CORS 安全配置

## 快速开始

### 环境要求

- Node.js >= 16

### 安装与运行

```bash
# 进入后端目录
cd RearEnd

# 安装依赖
npm install

# 创建 .env 文件（参考下方配置）
cp .env.example .env

# 启动服务
npm start
```

Windows 用户也可以直接运行 `RearEnd/start.bat`，它会自动检查端口占用并启动服务。

### 环境变量

在 `RearEnd/.env` 中配置：

```env
PORT=3000
JWT_SECRET=your_jwt_secret_here
NODE_ENV=development
```

### 访问

- 前端页面：直接在浏览器打开 `FrontEnd/index.html`，或通过后端静态文件服务访问
- API 地址：`http://localhost:3000`

## 许可证

MIT
