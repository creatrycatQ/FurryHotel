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
    return true;
  },

  /**
   * 退出登录
   */
  logout() {
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
};
