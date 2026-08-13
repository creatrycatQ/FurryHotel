/**
 * API 请求封装
 */
function getApiBase() {
  const customUrl = localStorage.getItem('custom_api_url');
  if (customUrl) {
    return customUrl.endsWith('/') ? customUrl.slice(0, -1) + '/api' : customUrl + '/api';
  }
  return 'https://furry.creatrycat.cn/api';
}

const API_BASE = getApiBase();

// 全局拦截 relative /api/ 请求，统一指向 API_BASE
if (typeof window !== 'undefined' && window.fetch) {
  const _originalFetch = window.fetch;
  window.fetch = function (resource, options) {
    if (typeof resource === 'string') {
      if (resource.startsWith('/api/')) {
        resource = API_BASE + resource.slice(4);
      } else if (resource.startsWith(location.origin + '/api/')) {
        resource = API_BASE + resource.slice(location.origin.length + 4);
      }
    }
    return _originalFetch.call(this, resource, options);
  };
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

/**
 * 全局内置退出登录/操作确认小窗弹窗
 */
function showLogoutModal(options = {}) {
  const title = options.title || '退出登录';
  const message = options.message || '确定要退出当前账号吗？';
  const onConfirm = options.onConfirm;

  let modal = document.getElementById('customLogoutModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'customLogoutModal';
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.25s ease, visibility 0.25s ease;
    `;
    modal.innerHTML = `
      <div id="customLogoutBox" style="background: #ffffff; color: #1c1917; border-radius: 24px; padding: 28px 24px; width: 86%; max-width: 320px; box-shadow: 0 20px 50px rgba(0,0,0,0.35); text-align: center; transform: scale(0.9); transition: transform 0.25s ease; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; border: 1px solid rgba(150,150,150,0.15);">
        <div style="font-size: 46px; margin-bottom: 12px; line-height: 1;">🚪</div>
        <h3 id="logoutModalTitle" style="margin: 0 0 8px 0; font-size: 19px; font-weight: 700; color: #1c1917;">${title}</h3>
        <p id="logoutModalMessage" style="margin: 0 0 24px 0; font-size: 14px; color: #78716c; line-height: 1.5;">${message}</p>
        <div style="display: flex; gap: 12px;">
          <button id="cancelLogoutModalBtn" style="flex: 1; padding: 11px 0; background: #f5f5f4; color: #44403c; border: none; border-radius: 14px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s;">取消</button>
          <button id="confirmLogoutModalBtn" style="flex: 1; padding: 11px 0; background: #ef4444; color: #ffffff; border: none; border-radius: 14px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(239,68,68,0.35); transition: transform 0.2s;">确认退出</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeFunc = () => {
      modal.style.opacity = '0';
      modal.style.visibility = 'hidden';
      const box = document.getElementById('customLogoutBox');
      if (box) box.style.transform = 'scale(0.9)';
    };

    document.getElementById('cancelLogoutModalBtn')?.addEventListener('click', closeFunc);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeFunc();
    });
  }

  const titleEl = document.getElementById('logoutModalTitle');
  const msgEl = document.getElementById('logoutModalMessage');
  const confirmBtn = document.getElementById('confirmLogoutModalBtn');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;

  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

  newConfirmBtn.addEventListener('click', () => {
    modal.style.opacity = '0';
    modal.style.visibility = 'hidden';
    const box = document.getElementById('customLogoutBox');
    if (box) box.style.transform = 'scale(0.9)';
    setTimeout(() => {
      if (typeof onConfirm === 'function') onConfirm();
    }, 150);
  });

  modal.style.display = 'flex';
  requestAnimationFrame(() => {
    modal.style.opacity = '1';
    modal.style.visibility = 'visible';
    const box = document.getElementById('customLogoutBox');
    if (box) box.style.transform = 'scale(1)';
  });
}
