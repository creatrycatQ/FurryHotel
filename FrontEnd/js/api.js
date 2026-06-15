/**
 * API 请求封装
 */
const API_BASE = 'http://localhost:3000/api';

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
    const json = await response.json();
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

  /** 扫码核验入住 */
  adminCheckin(orderId) {
    return this.request('POST', '/user/checkin', { order_id: orderId }, true);
  },
};
