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
   * 检查是否未登录管理员，未登录则跳转管理员登录页
   */
  requireAdminAuth() {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      window.location.href = 'admin-login.html';
      return false;
    }
    return true;
  },

  /**
   * 退出登录
   * @param {boolean} confirmFirst 是否展示内置确认小窗
   */
  logout(confirmFirst = true) {
    if (!confirmFirst) {
      clearTimeout(this._idleTimer);
      clearInterval(this._refreshTimer);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = 'index.html';
      return;
    }

    if (typeof showLogoutModal === 'function') {
      showLogoutModal({
        title: '退出登录',
        message: '确定要退出当前账号吗？',
        onConfirm: () => this.logout(false)
      });
    } else {
      clearTimeout(this._idleTimer);
      clearInterval(this._refreshTimer);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = 'index.html';
    }
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
      const resp = await fetch('/api/settings/session-timeout');
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
    pending: '待确认',
    approved: '待核验',
    confirmed: '已使用',
    checked_in: '已使用',
    completed: '已结束',
    cancelled: '已退票',
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
    fetch('/api/settings/site-info')
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

  /**
   * 初始化/执行“正在检查服务器”遮罩逻辑
   * @param {boolean} force 是否强制重新检查
   */
  async checkServer(force = false) {
    if (!force && sessionStorage.getItem('server_checked') === 'true') {
      return;
    }

    let overlay = document.getElementById('serverCheckOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'serverCheckOverlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        background: linear-gradient(135deg, #18181b 0%, #27272a 100%);
        z-index: 999999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        opacity: 1;
        transition: opacity 0.4s ease, visibility 0.4s ease;
      `;
      overlay.innerHTML = `
        <style>
          @keyframes serverCheckPulse {
            0%, 100% { transform: scale(1); opacity: 0.9; }
            50% { transform: scale(1.1); opacity: 1; }
          }
          @keyframes serverCheckSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
        <div style="text-align:center; padding:32px 24px; max-width:340px; width:85%; background:rgba(255,255,255,0.06); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.12); border-radius:24px; box-shadow:0 20px 40px rgba(0,0,0,0.5);">
          <div style="font-size:52px; margin-bottom:12px; animation:serverCheckPulse 2s infinite ease-in-out;">🐾</div>
          <h2 style="margin:0 0 6px 0; font-size:20px; font-weight:700; color:#fbbf24; letter-spacing:0.5px;">FurryEvent</h2>
          <p id="serverCheckStatus" style="margin:0 0 20px 0; font-size:14px; color:#e4e4e7; line-height:1.5;">正在检查服务器...</p>
          <div id="serverCheckSpinner" style="margin:0 auto; width:30px; height:30px; border:3px solid rgba(251,191,36,0.2); border-top-color:#fbbf24; border-radius:50%; animation:serverCheckSpin 0.8s linear infinite;"></div>
          <button id="serverCheckRetryBtn" style="display:none; margin:18px auto 0; padding:10px 24px; background:#f59e0b; color:#18181b; border:none; border-radius:20px; font-size:14px; font-weight:600; cursor:pointer; box-shadow:0 4px 12px rgba(245,158,11,0.3); transition:transform 0.2s ease;">重新连接</button>
        </div>
      `;
      document.body.appendChild(overlay);

      const retryBtn = document.getElementById('serverCheckRetryBtn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          App.checkServer(true);
        });
      }
    } else {
      overlay.style.display = 'flex';
      overlay.style.opacity = '1';
      overlay.style.visibility = 'visible';
    }

    const statusEl = document.getElementById('serverCheckStatus');
    const spinnerEl = document.getElementById('serverCheckSpinner');
    const retryBtn = document.getElementById('serverCheckRetryBtn');

    if (statusEl) statusEl.textContent = '正在检查服务器...';
    if (spinnerEl) spinnerEl.style.display = 'block';
    if (retryBtn) retryBtn.style.display = 'none';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    try {
      const targetUrl = (typeof API_BASE !== 'undefined' ? API_BASE : 'https://furry.creatrycat.cn/api') + '/settings/site-info';
      const resp = await fetch(targetUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timer);

      if (resp.ok || resp.status === 200) {
        if (statusEl) statusEl.textContent = '服务器连接正常 🐾';
        if (spinnerEl) spinnerEl.style.display = 'none';
        sessionStorage.setItem('server_checked', 'true');

        setTimeout(() => {
          if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.visibility = 'hidden';
            setTimeout(() => overlay.remove(), 400);
          }
        }, 500);
      } else {
        throw new Error('HTTP ' + resp.status);
      }
    } catch (err) {
      clearTimeout(timer);
      if (statusEl) statusEl.textContent = '服务器连接失败，请检查网络设置';
      if (spinnerEl) spinnerEl.style.display = 'none';
      if (retryBtn) retryBtn.style.display = 'inline-block';
    }
  },
};

// 应用启动时自动触发服务器校验
if (typeof document !== 'undefined') {
  const runAutoCheck = () => App.checkServer();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAutoCheck);
  } else {
    runAutoCheck();
  }
}

