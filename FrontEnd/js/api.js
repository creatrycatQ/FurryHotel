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
