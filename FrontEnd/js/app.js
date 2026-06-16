/**
 * 通用工具函数
 */

const App = {
  /**
   * 显示 Toast 提示
   * @param {'success'|'error'|'info'} type
   */
  toast(message, type = 'info', duration = 2500) {
    // 移除已有 toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    document.body.appendChild(el);

    // 触发动画
    requestAnimationFrame(() => el.classList.add('show'));

    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, duration);
  },

  /**
   * 检查是否已登录，已登录则跳转首页
   */
  checkLoggedIn() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
      window.location.href = 'home.html';
    }
  },

  /**
   * 检查是否未登录，未登录则跳转登录页
   */
  requireAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = 'index.html';
      return false;
    }
    // 已登录，启动会话管理
    this.initSession();
    return true;
  },

  /**
   * 退出登录
   */
  logout() {
    clearTimeout(this._idleTimer);
    clearInterval(this._refreshTimer);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
  },

  /**
   * 保存登录信息
   */
  saveLogin(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },

  /**
   * 获取当前 token
   */
  getToken() {
    return localStorage.getItem('token') || '';
  },

  /**
   * 获取当前用户
   */
  getUser() {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  },

  /**
   * 按钮 loading 状态
   */
  setBtnLoading(btn, loading) {
    if (loading) {
      btn.disabled = true;
      btn.dataset.originalText = btn.textContent;
      btn.innerHTML = '<span class="loading-spinner"></span>处理中...';
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || btn.textContent;
    }
  },

  // ========== 会话超时管理 ==========

  _idleTimer: null,
  _refreshTimer: null,
  _timeoutMinutes: 480,
  _lastActivity: 0,
  _sessionInited: false,

  /**
   * 初始化会话管理：拉取超时配置 → 启动空闲计时器 → 启动刷新定时器
   */
  initSession() {
    if (this._sessionInited) return;
    this._sessionInited = true;

    this._fetchTimeoutConfig().then(() => {
      this._resetIdleTimer();
      this._startRefreshTimer();
    });

    // 监听用户活动事件
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(evt => {
      document.addEventListener(evt, () => this._resetIdleTimer(), { passive: true });
    });
  },

  /**
   * 从服务端拉取超时配置
   */
  async _fetchTimeoutConfig() {
    try {
      const resp = await fetch(window.location.origin + '/api/settings/session-timeout');
      const json = await resp.json();
      if (json.code === 200 && json.data) {
        this._timeoutMinutes = json.data.timeout_minutes;
      }
    } catch (e) {
      // 使用默认值
    }
  },

  /**
   * 重置空闲计时器（节流：30秒内不重复重置）
   */
  _resetIdleTimer() {
    const now = Date.now();
    if (now - this._lastActivity < 30000) return;
    this._lastActivity = now;

    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => this._showIdleWarning(), this._timeoutMinutes * 60 * 1000);
  },

  /**
   * 显示空闲超时警告
   */
  _showIdleWarning() {
    const stay = confirm('您已长时间未操作，会话即将过期。点击"确定"继续使用。');
    if (stay) {
      this._lastActivity = 0; // 强制重置
      this._resetIdleTimer();
      // 刷新 token
      api.refreshToken().then(r => {
        if (r.code === 200 && r.data) {
          localStorage.setItem('token', r.data.token);
        }
      });
    } else {
      this.logout();
    }
  },

  /**
   * 启动 Token 自动刷新定时器（周期 = 超时时间 × 75%）
   */
  _startRefreshTimer() {
    clearInterval(this._refreshTimer);
    const intervalMs = this._timeoutMinutes * 60 * 1000 * 0.75;
    this._refreshTimer = setInterval(() => {
      if (!this.getToken()) return;
      api.refreshToken().then(r => {
        if (r.code === 200 && r.data) {
          localStorage.setItem('token', r.data.token);
        }
      });
    }, intervalMs);
  },

  /**
   * 订单状态映射
   */
  statusMap: {
    pending: '待审批',
    approved: '待入住',
    confirmed: '已核验',
    checked_in: '已入住',
    completed: '已完成',
    cancelled: '已取消',
  },

  /**
   * 获取订单状态中文文本
   */
  getStatusText(status) {
    return this.statusMap[status] || status;
  },

  /**
   * 从服务端加载网站信息（标题、副标题、版权），替换页面中对应元素
   */
  loadSiteInfo() {
    fetch(window.location.origin + '/api/settings/site-info')
      .then(r => r.json())
      .then(d => {
        if (d.code !== 200 || !d.data) return;
        const { site_title, site_subtitle, copyright_text } = d.data;
        const titleEl = document.querySelector('.logo-title');
        if (titleEl && site_title) titleEl.textContent = site_title;
        const subEl = document.querySelector('.logo-sub');
        if (subEl && site_subtitle) subEl.textContent = site_subtitle;
        const copyEl = document.querySelector('.copyright-text');
        if (copyEl && copyright_text) copyEl.textContent = copyright_text;
      })
      .catch(() => {});
  },
};
