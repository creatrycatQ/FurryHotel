#!/bin/bash
#
# FurryHotel 一键部署脚本 (Ubuntu 20.04 / 22.04 / 24.04)
# 从 GitHub 拉取代码并部署
#
# 用法: curl -fsSL https://raw.githubusercontent.com/creatrycatQ/FurryHotel/master/deploy.sh | sudo bash
# 或者: wget -qO- https://raw.githubusercontent.com/creatrycatQ/FurryHotel/master/deploy.sh | sudo bash
#

set -e

# ---------- 配置区 ----------
APP_NAME="furry-hotel"
APP_DIR="/opt/furry-hotel"
APP_USER="furryhotel"
REPO_URL="https://github.com/creatrycatQ/FurryHotel.git"
BRANCH="master"
NODE_VERSION="20"
PORT=3000

# ---------- 颜色 ----------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ---------- 检查 root ----------
if [ "$EUID" -ne 0 ]; then
  error "请使用 root 权限运行: sudo bash deploy.sh"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     FurryHotel 一键部署脚本              ║"
echo "║     从 GitHub 拉取并部署                 ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ---------- 1. 系统更新 & 基础工具 ----------
info "更新系统包..."
apt-get update -qq
apt-get install -y -qq curl git build-essential

# ---------- 2. 安装 Node.js ----------
if command -v node &> /dev/null; then
  CURRENT_NODE=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$CURRENT_NODE" -ge "$NODE_VERSION" ]; then
    info "Node.js $(node -v) 已安装，跳过"
  else
    warn "Node.js 版本过低 ($(node -v))，升级到 v${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y -qq nodejs
  fi
else
  info "安装 Node.js v${NODE_VERSION}..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
fi

info "Node: $(node -v)  NPM: $(npm -v)"

# ---------- 3. 安装 PM2 ----------
if ! command -v pm2 &> /dev/null; then
  info "安装 PM2..."
  npm install -g pm2
fi

# ---------- 4. 创建系统用户 ----------
if ! id "$APP_USER" &> /dev/null; then
  info "创建系统用户 ${APP_USER}..."
  useradd -r -m -s /bin/bash "$APP_USER"
fi

# ---------- 5. 从 GitHub 拉取代码 ----------
if [ -d "$APP_DIR/.git" ]; then
  info "代码目录已存在，拉取最新版本..."
  cd "$APP_DIR"
  git fetch origin
  git reset --hard "origin/$BRANCH"
else
  info "从 GitHub 克隆项目..."
  rm -rf "$APP_DIR"
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# ---------- 6. 创建数据目录 ----------
mkdir -p "$APP_DIR/data"

# ---------- 7. 配置环境变量 ----------
ENV_FILE="$APP_DIR/RearEnd/.env"
if [ ! -f "$ENV_FILE" ]; then
  info "生成 .env 配置文件..."
  JWT_SECRET=$(openssl rand -hex 32)
  cat > "$ENV_FILE" << EOF
NODE_ENV=production
PORT=${PORT}
JWT_SECRET=${JWT_SECRET}
CORS_ORIGINS=http://localhost:${PORT}
DB_PATH=../data/furry_hotel.db
EOF
  warn "请编辑 ${ENV_FILE} 设置正确的 CORS_ORIGINS（你的域名）"
else
  info ".env 文件已存在，保留现有配置"
fi

# ---------- 8. 安装依赖 ----------
info "安装 Node.js 依赖..."
cd "$APP_DIR/RearEnd"
npm install --production --silent

# ---------- 9. 设置文件权限 ----------
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
chmod 600 "$ENV_FILE"

# ---------- 10. 创建日志目录 ----------
mkdir -p "$APP_DIR/RearEnd/logs"
chown "$APP_USER":"$APP_USER" "$APP_DIR/RearEnd/logs"

# ---------- 11. PM2 启动/重启应用 ----------
if su - "$APP_USER" -c "pm2 describe $APP_NAME" &> /dev/null; then
  info "重启应用..."
  su - "$APP_USER" -c "cd $APP_DIR/RearEnd && pm2 restart $APP_NAME"
else
  info "启动应用..."
  su - "$APP_USER" -c "cd $APP_DIR/RearEnd && pm2 start ecosystem.config.js --env production"
fi
su - "$APP_USER" -c "pm2 save"

# 设置 PM2 开机自启
env PATH=$PATH:/usr/bin pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"

# ---------- 12. 配置防火墙 ----------
if command -v ufw &> /dev/null; then
  info "配置防火墙..."
  ufw allow 22/tcp   > /dev/null 2>&1 || true
  ufw allow 80/tcp   > /dev/null 2>&1 || true
  ufw allow 443/tcp  > /dev/null 2>&1 || true
  ufw allow ${PORT}/tcp > /dev/null 2>&1 || true
fi

# ---------- 13. (可选) 配置 Nginx 反向代理 ----------
if ! command -v nginx &> /dev/null; then
  read -p "是否安装 Nginx 作为反向代理？[y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    apt-get install -y -qq nginx

    cat > /etc/nginx/sites-available/$APP_NAME << 'NGINX'
server {
    listen 80;
    server_name _;

    add_header X-Robots-Tag "noindex, nofollow" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10m;
    }
}
NGINX

    ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl restart nginx && systemctl enable nginx
    info "Nginx 反向代理已配置 (端口 80 → ${PORT})"
  fi
else
  info "Nginx 已安装，跳过配置（如需更新请手动编辑）"
fi

# ---------- 完成 ----------
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║              ✅ 部署完成！                        ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  应用目录:  ${APP_DIR}"
echo "║  配置文件:  ${APP_DIR}/RearEnd/.env"
echo "║  数据目录:  ${APP_DIR}/data/"
echo "║  运行用户:  ${APP_USER}"
echo "║  服务端口:  ${PORT}"
echo "╠══════════════════════════════════════════════════╣"
echo "║  管理命令:"
echo "║    su - ${APP_USER} -c 'pm2 status'"
echo "║    su - ${APP_USER} -c 'pm2 logs'"
echo "║    su - ${APP_USER} -c 'pm2 restart all'"
echo "╠══════════════════════════════════════════════════╣"
echo "║  ⚠️  首次部署请查看日志获取管理员初始密码："
echo "║    su - ${APP_USER} -c 'pm2 logs --lines 30'"
echo "╠══════════════════════════════════════════════════╣"
echo "║  后续步骤:"
echo "║  1. 编辑 .env 设置 CORS_ORIGINS 为你的域名"
echo "║  2. 配置 SSL: certbot --nginx -d yourdomain.com"
echo "║  3. 登录管理后台修改默认密码"
echo "╠══════════════════════════════════════════════════╣"
echo "║  更新部署（再次运行即可拉取最新代码并重启）："
echo "║    sudo bash ${APP_DIR}/deploy.sh"
echo "╚══════════════════════════════════════════════════╝"
echo ""
