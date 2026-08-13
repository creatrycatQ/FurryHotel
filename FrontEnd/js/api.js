/**
 * API 请求封装
 */
function getApiBase() {
  const customUrl = localStorage.getItem('custom_api_url');
  if (customUrl) {
    return customUrl.endsWith('/') ? customUrl.slice(0, -1) + '/api' : customUrl + '/api';
  }
  const isMobileApp = window.location.protocol === 'capacitor:' || window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isMobileApp && (window.location.port !== '80' && window.location.port !== '443' && window.location.port !== '')) {
    return 'http://localhost:3000/api';
  }
  if (window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file://')) {
    return window.location.origin + '/api';
  }
  return 'http://localhost:3000/api';
}

const API_BASE = getApiBase();

// 全局自动为 APP / 文件模式注入右上角服务器设置悬浮按钮
if (typeof document !== 'undefined') {
  const initServerBadge = () => {
    if (!document.getElementById('globalServerConfigBadge') && document.body) {
      const badge = document.createElement('div');
      badge.id = 'globalServerConfigBadge';
      badge.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999;font-family:sans-serif;';
      badge.innerHTML = `
        <button style="background:rgba(255,255,255,0.95);border:1.5px solid #f59e0b;color:#d97706;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:bold;box-shadow:0 3px 10px rgba(0,0,0,0.15);cursor:pointer;">
          ⚙️ 服务器设置
        </button>
      `;
      badge.querySelector('button').addEventListener('click', () => {
        const current = localStorage.getItem('custom_api_url') || '';
        const input = prompt('请输入后端服务器地址 (例如 http://192.168.1.100:3000):', current);
        if (input !== null) {
          if (input.trim() === '') {
            localStorage.removeItem('custom_api_url');
            alert('已重置为默认服务器地址');
          } else {
            let url = input.trim();
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
              url = 'http://' + url;
            }
            localStorage.setItem('custom_api_url', url);
            alert('服务器地址已保存为: ' + url);
          }
          location.reload();
        }
      });
      document.body.appendChild(badge);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initServerBadge);
  } else {
    initServerBadge();
  }
}

const api = {
  /**
   * 发送 HTTP 请求
   */
  async request(method, url, data = null, needAuth = false) {
    const headers = { 'Content-Type': 'application/json' };

    if (needAuth) {
      const token = localStorage.getItem('token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const options = { method, headers };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(`${API_BASE}${url}`, options);

    // 防御非 JSON 响应（如反向代理返回 HTML 错误页面）
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { code: response.status, message: `服务器响应异常 (${response.status})` };
    }

    const json = await response.json();

    // 401 拦截：token 过期或无效时自动跳转登录页（排除 refresh 本身避免死循环）
    if (response.status === 401 && needAuth && !url.includes('/auth/refresh')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = 'index.html';
      return json;
    }

    return json;
  },

  // ---- 认证接口 ----

  /** 注册 */
  register(data) {
    return this.request('POST', '/auth/register', data);
  },

  /** 登录 */
  login(data) {
    return this.request('POST', '/auth/login', data);
  },

  /** 获取当前用户信息 */
  getMe() {
    return this.request('GET', '/auth/me', null, true);
  },

  /** 刷新 Token */
  refreshToken() {
    return this.request('POST', '/auth/refresh', null, true);
  },

  /** 健康检查 */
  health() {
    return this.request('GET', '/health');
  },

  // ---- 用户订单接口 ----

  /** 获取当前用户订单列表 */
  getUserOrders() {
    return this.request('GET', '/user/orders', null, true);
  },

  /** 获取单个订单详情 */
  getUserOrder(id) {
    return this.request('GET', `/user/orders/${id}`, null, true);
  },

  // ---- 管理员核验接口 ----

  /** 扫码验票入场 */
  adminCheckin(orderId) {
    return this.request('POST', '/user/checkin', { order_id: orderId }, true);
  },
};
