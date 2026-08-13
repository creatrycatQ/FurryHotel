(function () {
  var A = location.origin + '/api/admin', T = '', E = null, G = null, O = null;
  var RM = {};
  var editingRoomId = null, editingGuestId = null, editingOrderId = null, editingGuestDetailId = null;
  var RS = { available: '空闲可用', occupied: '已入住', cleaning: '已入住', maintenance: '维护中', reserved: '已预订' };
  var GS = { checked_in: '已使用', checked_out: '已离场' };
  var OrderStatus = { pending: '待确认', approved: '待核验', confirmed: '已使用', cancelled: '已退票', completed: '已结束', checked_in: '已使用' };
  var DS = { collected: '已收取', refunded: '已退还', forfeited: '已扣除' };
  var currentOrderFilter = 'all';
  var allOrdersCache = [];
  var approveTargetOrder = null;

  // HTML 转义，防止 XSS
  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }

  function maskPhone(p) {
    if (!p) return '-';
    if (p.length <= 3) return p;
    return p.slice(0, 3) + '*'.repeat(p.length - 3);
  }

  function maskIdCard(id) {
    if (!id) return '-';
    if (id.length <= 4) return id;
    return '*'.repeat(id.length - 4) + id.slice(-4);
  }

  async function init() {
    T = localStorage.getItem('admin_token');
    if (!T) { location.href = 'admin-login.html'; return }
    try {
      var r = await fetch(location.origin + '/api/auth/me', { headers: { Authorization: 'Bearer ' + T } });
      var d = await r.json();
      if (d.code !== 200) { location.href = 'admin-login.html'; return }
      document.getElementById('sidebarUser').textContent = d.data.nickname || d.data.username;

      var page = document.body.getAttribute('data-page') || 'dashboard';
      document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active') });
      document.querySelectorAll('.nav-sub-item').forEach(function (n) { n.classList.remove('active') });
      var activeNav = document.querySelector('.nav-item[data-tab="' + page + '"]') || document.querySelector('.nav-sub-item[data-tab="' + page + '"]');
      if (activeNav) {
        activeNav.classList.add('active');
        var group = activeNav.closest('.nav-group');
        if (group) group.classList.add('open');
      }

      if (page === 'dashboard') loadDashboard();
      else if (page === 'rooms') loadRooms();
      else if (page === 'roomTypes') loadRoomTypes();
      else if (page === 'hotelRoomTypes') loadHotelRoomTypes();
      else if (page === 'guests') loadGuests();
      else if (page === 'guestDetails') loadGuestDetails();
      else if (page === 'orders') loadOrders();
      else if (page === 'deposit') loadDeposits();
      else if (page === 'staffDeposits') loadStaffDeposits();
      else if (page === 'users') loadUsers();
      else if (page === 'inviteCodes') loadInviteCodes();
      else if (page === 'settings') loadSettings();
      else if (page === 'verify') switchVerifyMode('scan');

      setupNav(); setupToggle();
      initSessionManagement();
    } catch (e) { location.href = 'admin-login.html' }
  }

  async function api(url, m, b) {
    var o = { method: m || 'GET', headers: { Authorization: 'Bearer ' + T } };
    if (b) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(b) }
    var r = await fetch(A + url, o);
    // 401 拦截：token 无效或过期时跳转管理员登录页
    if (r.status === 401) {
      localStorage.removeItem('admin_token'); localStorage.removeItem('admin_user');
      location.href = 'admin-login.html'; return { code: 401, message: '会话已过期' }
    }
    return r.json()
  }
  window.api = api;

  function toast(msg, tp) {
    tp = tp || 'info'; var old = document.querySelector('.toast'); if (old) old.remove();
    var el = document.createElement('div'); el.className = 'toast toast-' + tp; el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show') });
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove() }, 300) }, 2500)
  }
  window.toast = toast;


  function setupToggle() {
    document.getElementById('sidebarToggle').addEventListener('click', function () {
      var s = document.getElementById('sidebar'), m = document.getElementById('mainContent');
      var c = s.classList.toggle('collapsed'); m.classList.toggle('expanded');
      localStorage.setItem('sidebarCollapsed', c ? '1' : '0')
    });
    if (localStorage.getItem('sidebarCollapsed') === '1') {
      document.getElementById('sidebar').classList.add('collapsed');
      document.getElementById('mainContent').classList.add('expanded')
    }
  }

  function setupNav() {
    document.querySelectorAll('.nav-parent').forEach(function (parent) {
      parent.addEventListener('click', function () {
        var group = this.closest('.nav-group');
        var isOpen = group.classList.contains('open');
        document.querySelectorAll('.nav-group').forEach(function (g) {
          g.classList.remove('open');
        });
        if (!isOpen) {
          group.classList.add('open');
        }
      });
    });
  }

  // ===== 仪表盘 =====
  async function loadDashboard() {
    var r = await api('/dashboard');
    if (r.code !== 200) return;
    var d = r.data;
    document.getElementById('statRooms').textContent = d.availableRooms + ' / ' + d.totalRooms;
    document.getElementById('statGuests').textContent = d.totalGuests;
    document.getElementById('statOrders').textContent = d.totalOrders;
    document.getElementById('statTodayCheckIn').textContent = d.todayCheckIn;
    document.getElementById('statRevenue').textContent = '\u00a5' + (d.todayRevenue || 0);
    var pendingEl = document.getElementById('statPendingOrders');
    if (pendingEl) pendingEl.textContent = d.pendingOrders || 0;
  }

  // ===== 门票座位管理 =====
  async function ensureRoomTypes() {
    var rt = await api('/room-types');
    var hrt = await api('/hotel-room-types');
    RM = {};
    if (rt.code === 200 && rt.data) {
      rt.data.forEach(function (t) { RM[t.name] = t.label || t.name });
    }
    if (hrt.code === 200 && hrt.data) {
      hrt.data.forEach(function (t) { RM[t.name] = t.label || t.name });
    }
  }

  async function loadRooms() {
    await ensureRoomTypes();
    var r = await api('/rooms');
    var grid = document.getElementById('roomGrid');
    if (!grid || r.code !== 200) return;
    grid.innerHTML = r.data.map(function (o) {
      return '<div class="room-card border-' + esc(o.status) + '">' +
        '<div class="room-card-header">' +
        '<span class="room-card-number">' + esc(o.room_number) + '</span>' +
        '<span class="status-tag status-' + esc(o.status) + '">' + esc(RS[o.status]) + ' (' + esc(o.current_occupants) + ' / ' + esc(o.capacity || 2) + '人)</span>' +
        '</div>' +
        '<div class="room-card-type">' + esc(RM[o.room_type] || o.room_type) + ' \u00b7 ' + esc(o.floor) + '区</div>' +
        '<div class="room-card-price">\u00a5' + esc(o.price) + '</div>' +
        (o.occupants && o.occupants.length ? '<div class="room-card-occupant"><span class="occupant-label">同行人员:</span><div class="occupant-list">' + o.occupants.map(function (u) { return '<div class="occupant-row" style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><img class="occupant-avatar" src="' + (u.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(u.nickname) + '&size=28&background=random') + '" alt="" /><span class="occupant-nickname">' + esc(u.nickname) + '</span><span class="occupant-realname">(' + esc(u.real_name || '-') + ')</span><button class="btn btn-sm btn-outline" style="margin-left:auto;padding:2px 6px;font-size:11px;" onclick="Admin.showTransferRoom(' + u.order_id + ',\'' + esc(u.real_name || u.nickname) + '\',\'' + esc(o.room_number) + '\')">迁移</button></div>' }).join('') + '</div></div>' : '') +
        '<div class="room-card-desc">' + esc(o.description || '') + '</div>' +
        '<div class="room-card-actions">' +
        '<button class="btn btn-sm btn-primary" onclick="Admin.editRoom(' + o.id + ')">\u7f16\u8f91</button>' +
        (o.status !== 'available' ? '<button class="btn btn-sm btn-warning" onclick="Admin.checkoutRoom(' + o.id + ')">释放席位</button>' : '') +
        '<button class="btn btn-sm btn-danger" onclick="Admin.deleteRoom(' + o.id + ')">\u5220\u9664</button>' +
        '</div>' +
        '</div>'
    }).join('')
  }

  async function loadRoomTypeOptions(selectedValue) {
    var r = await api('/hotel-room-types');
    var sel = document.getElementById('rmType');
    sel.innerHTML = '<option value="">请选择客房房型</option>';
    if (r.code === 200 && r.data) {
      r.data.forEach(function (t) {
        var opt = document.createElement('option');
        opt.value = t.name; opt.textContent = t.label + ' (' + t.capacity + '人)';
        sel.appendChild(opt);
      });
    }
    if (selectedValue) sel.value = selectedValue;
  }

  async function showRoomModal() {
    editingRoomId = null;
    document.getElementById('roomModalTitle').textContent = '添加门票座位';
    document.getElementById('rmNumber').value = '';
    document.getElementById('rmFloor').value = 1; document.getElementById('rmPrice').value = 288;
    document.getElementById('rmStatus').value = 'available'; document.getElementById('rmDesc').value = '';
    await loadRoomTypeOptions('');
    document.getElementById('roomModalOverlay').classList.remove('hidden');
  }
  function closeRoomModal() { document.getElementById('roomModalOverlay').classList.add('hidden') }

  window.Admin = {};
  window.Admin.editRoom = async function (id) {
    editingRoomId = id;
    var r = await api('/rooms/' + id);
    if (r.code !== 200) return;
    var o = r.data;
    document.getElementById('roomModalTitle').textContent = '编辑门票座位';
    document.getElementById('rmNumber').value = o.room_number;
    await loadRoomTypeOptions(o.room_type);
    document.getElementById('rmFloor').value = o.floor; document.getElementById('rmPrice').value = o.price;
    document.getElementById('rmStatus').value = o.status; document.getElementById('rmDesc').value = o.description || '';
    document.getElementById('roomModalOverlay').classList.remove('hidden')
  };

  window.Admin.saveRoom = async function () {
    var data = {
      room_number: document.getElementById('rmNumber').value.trim(), room_type: document.getElementById('rmType').value,
      floor: parseInt(document.getElementById('rmFloor').value) || 1, price: parseFloat(document.getElementById('rmPrice').value) || 0,
      status: document.getElementById('rmStatus').value, description: document.getElementById('rmDesc').value.trim()
    };
    if (!data.room_number) return toast('座位号/门票号不能为空', 'error');
    var r;
    if (editingRoomId) { r = await api('/rooms/' + editingRoomId, 'PUT', data) }
    else { r = await api('/rooms', 'POST', data) }
    if (r.code === 200 || r.code === 201) { closeRoomModal(); loadRooms(); toast(r.message || '\u4fdd\u5b58\u6210\u529f', 'success') }
    else { toast(r.message, 'error') }
  };

  window.Admin.deleteRoom = async function (id) {
    if (!confirm('确定删除该门票座位？')) return;
    var r = await api('/rooms/' + id, 'DELETE');
    if (r.code === 200) { loadRooms(); toast('\u5220\u9664\u6210\u529f', 'success') }
    else { toast(r.message, 'error') }
  };

  window.Admin.checkoutRoom = async function (id) {
    if (!confirm('确定释放该席位？座位将重置为空闲可用状态')) return;
    var r = await api('/rooms/' + id, 'PUT', { status: 'available' });
    if (r.code === 200) { loadRooms(); toast('释放座位成功', 'success') }
    else { toast(r.message, 'error') }
  };

  // ===== 门票类型管理 =====
  async function loadRoomTypes() {
    var r = await api('/room-types');
    var tb = document.getElementById('roomTypeTableBody');
    if (r.code !== 200) { tb.innerHTML = '<tr><td colspan="5">加载失败</td></tr>'; return }
    var list = r.data || [];
    tb.innerHTML = list.map(function (t) {
      var roomPkgText = t.isRoomPackage ? '<span class="status-tag status-occupied" style="background:#e8f5e9;color:#2e7d32;border:none;padding:2px 8px;border-radius:12px;">含住宿 (' + esc(t.hotelRoomType || '-') + ')</span>' : '<span class="status-tag status-available" style="background:#efebe9;color:#4e342e;border:none;padding:2px 8px;border-radius:12px;">仅门票 (库:' + esc(t.stock) + ')</span>';
      return '<tr><td>' + esc(t.label || t.name) + '</td><td>' + roomPkgText + '</td><td>¥' + esc(t.basePrice) + '</td><td>' + esc(t.description || '-') + '</td><td>' +
        '<button class="btn btn-sm" onclick="editRoomType(' + t.id + ')">编辑</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="deleteRoomType(' + t.id + ')">删除</button></td></tr>'
    }).join('')
  }

  async function loadHotelRoomTypeOptions(selectedValue) {
    var r = await api('/hotel-room-types');
    var sel = document.getElementById('rtHotelRoomType');
    sel.innerHTML = '<option value="">请选择关联客房房型</option>';
    if (r.code === 200 && r.data) {
      r.data.forEach(function (t) {
        var opt = document.createElement('option');
        opt.value = t.name; opt.textContent = t.label + ' (' + t.capacity + '人)';
        sel.appendChild(opt);
      });
    }
    if (selectedValue) sel.value = selectedValue;
  }

  window.Admin.toggleRoomPackageEdit = function (isRoomPackage) {
    var rtRoomTypeGroup = document.getElementById('rtRoomTypeGroup');
    var rtStockGroup = document.getElementById('rtStockGroup');
    if (isRoomPackage) {
      rtRoomTypeGroup.classList.remove('hidden');
      rtStockGroup.classList.add('hidden');
    } else {
      rtRoomTypeGroup.classList.add('hidden');
      rtStockGroup.classList.remove('hidden');
    }
  };

  var editingRoomTypeId = null;
  window.showRoomTypeModal = async function () {
    editingRoomTypeId = null;
    document.getElementById('roomTypeModalTitle').textContent = '添加门票类型';
    document.getElementById('rtLabel').value = ''; document.getElementById('rtBasePrice').value = '0'; document.getElementById('rtDeposit').value = '0'; document.getElementById('rtDesc').value = '';
    document.getElementById('rtIsRoomPackage').checked = false;
    document.getElementById('rtStock').value = '100';
    Admin.toggleRoomPackageEdit(false);
    await loadHotelRoomTypeOptions('');
    document.getElementById('roomTypeModalOverlay').classList.remove('hidden')
  };
  window.editRoomType = async function (id) {
    editingRoomTypeId = id;
    var r = await api('/room-types/' + id);
    if (r.code !== 200) return toast(r.message || '获取失败', 'error');
    var o = r.data;
    document.getElementById('roomTypeModalTitle').textContent = '编辑门票类型';
    document.getElementById('rtLabel').value = o.label || o.name || ''; document.getElementById('rtBasePrice').value = o.basePrice || 0; document.getElementById('rtDeposit').value = o.defaultDeposit || 0; document.getElementById('rtDesc').value = o.description || '';
    document.getElementById('rtIsRoomPackage').checked = !!o.isRoomPackage;
    document.getElementById('rtStock').value = o.stock || 0;
    Admin.toggleRoomPackageEdit(!!o.isRoomPackage);
    await loadHotelRoomTypeOptions(o.hotelRoomType || '');
    document.getElementById('roomTypeModalOverlay').classList.remove('hidden')
  };
  window.Admin.saveRoomType = async function () {
    var label = document.getElementById('rtLabel').value.trim();
    if (!label) return toast('类型名称不能为空', 'error');
    var isRoomPackage = document.getElementById('rtIsRoomPackage').checked;
    var hotelRoomType = document.getElementById('rtHotelRoomType').value;
    if (isRoomPackage && !hotelRoomType) return toast('包含住宿时必须关联客房房型', 'error');
    var data = {
      label: label,
      basePrice: parseFloat(document.getElementById('rtBasePrice').value) || 0,
      defaultDeposit: parseFloat(document.getElementById('rtDeposit').value) || 0,
      description: document.getElementById('rtDesc').value.trim(),
      isRoomPackage: isRoomPackage,
      hotelRoomType: isRoomPackage ? hotelRoomType : null,
      stock: isRoomPackage ? 0 : (parseInt(document.getElementById('rtStock').value) || 0)
    };
    var r;
    if (editingRoomTypeId) {
      r = await api('/room-types/' + editingRoomTypeId, 'PUT', data)
    } else {
      data.name = 'type_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      r = await api('/room-types', 'POST', data)
    }
    if (r.code === 200 || r.code === 201) {
      Admin.closeModal('roomTypeModalOverlay');
      if (document.getElementById('roomTypeTableBody')) loadRoomTypes();
      if (document.getElementById('roomGrid')) loadRooms();
      toast(r.message || '保存成功', 'success')
    }
    else { toast(r.message, 'error') }
  };
  window.deleteRoomType = async function (id) {
    if (!confirm('确定删除该门票类型？')) return;
    var r = await api('/room-types/' + id, 'DELETE');
    if (r.code === 200) {
      if (document.getElementById('roomTypeTableBody')) loadRoomTypes();
      if (document.getElementById('roomGrid')) loadRooms();
      toast(r.message || '删除成功', 'success')
    }
    else { toast(r.message, 'error') }
  };

  // ===== 押金管理 =====
  async function loadDeposits() {
    var r = await api('/deposits');
    var tb = document.getElementById('depositTableBody');
    if (r.code !== 200) { tb.innerHTML = '<tr><td colspan="8">加载失败</td></tr>'; return }
    var list = r.data || [];
    if (list.length === 0) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-secondary)">暂无押金记录</td></tr>'; return }
    tb.innerHTML = list.map(function (d) {
      return '<tr>' +
        '<td>' + esc(d.id) + '</td>' +
        '<td>' + (d.order_id ? '#' + esc(d.order_id) + ' ' + esc(d.guest_name || '') : '-') + '</td>' +
        '<td>' + esc(d.user_nickname || d.username || '-') + '</td>' +
        '<td>' + esc(d.room_number || '-') + '</td>' +
        '<td>¥' + esc(d.amount) + '</td>' +
        '<td><span class="status-tag status-' + esc(d.status) + '">' + esc(DS[d.status] || d.status) + '</span></td>' +
        '<td>' + esc(d.paid_at || '-') + '</td>' +
        '<td>' + (d.status === 'collected' ? '<button class="btn btn-sm btn-primary" onclick="Admin.showDepositModal(' + d.id + ')">操作</button>' : '<span style="color:var(--text-secondary);font-size:12px">' + esc(d.remark || '') + '</span>') + '</td>' +
        '</tr>'
    }).join('')
  }

  window.Admin.showDepositModal = async function (id) {
    var r = await api('/deposits/' + id);
    if (r.code !== 200) return toast(r.message || '获取失败', 'error');
    var d = r.data;
    document.getElementById('dpId').value = d.id;
    document.getElementById('dpUser').textContent = d.user_nickname || d.username || '-';
    document.getElementById('dpRoom').textContent = d.room_number || '-';
    document.getElementById('dpAmount').textContent = '¥' + d.amount;
    document.getElementById('dpStatus').textContent = DS[d.status] || d.status;
    document.getElementById('dpRemark').value = '';
    var actions = document.getElementById('dpActions');
    if (d.status === 'collected') {
      actions.querySelector('.btn-success').style.display = '';
      actions.querySelector('.btn-danger').style.display = '';
    } else {
      actions.querySelector('.btn-success').style.display = 'none';
      actions.querySelector('.btn-danger').style.display = 'none';
    }
    document.getElementById('depositModalOverlay').classList.remove('hidden')
  };

  window.Admin.refundDeposit = async function () {
    var id = document.getElementById('dpId').value;
    var remark = document.getElementById('dpRemark').value.trim();
    var r = await api('/deposits/' + id + '/refund', 'PUT', { remark: remark });
    if (r.code === 200) { Admin.closeModal('depositModalOverlay'); loadDeposits(); toast('退还成功', 'success') }
    else { toast(r.message, 'error') }
  };

  window.Admin.forfeitDeposit = async function () {
    var id = document.getElementById('dpId').value;
    var remark = document.getElementById('dpRemark').value.trim();
    if (!remark) return toast('扣除押金必须填写原因', 'error');
    var r = await api('/deposits/' + id + '/forfeit', 'PUT', { remark: remark });
    if (r.code === 200) { Admin.closeModal('depositModalOverlay'); loadDeposits(); toast('扣除成功', 'success') }
    else { toast(r.message, 'error') }
  };

  // ===== 实名信息 =====
  async function loadGuests() {
    var r = await api('/guests');
    var grid = document.getElementById('guestGrid');
    if (r.code !== 200) return;
    grid.innerHTML = r.data.map(function (o) {
      return '<div class="stat-card guest-card">' +
        '<div class="stat-label">' + esc(o.real_name) + '</div>' +
        '<div class="guest-info"><span>账号：' + esc(o.nickname || o.username) + '</span></div>' +
        '<div class="guest-info"><span>电话：' + esc(o.phone || '-') + '</span></div>' +
        '<div class="guest-info"><span>身份证：' + esc(o.id_card || '-') + '</span></div>' +
        '<div class="guest-card-actions">' +
        '<button class="btn btn-sm btn-primary" onclick="Admin.editGuest(' + o.id + ')">编辑</button>' +
        '</div>' +
        '</div>'
    }).join('')
  }

  function closeGuestModal() { document.getElementById('guestModalOverlay').classList.add('hidden') }

  window.Admin.editGuest = async function (id) {
    editingGuestId = id;
    var r = await api('/guests/' + id);
    if (r.code !== 200) return;
    var o = r.data;
    document.getElementById('guestModalTitle').textContent = '编辑实名信息';
    document.getElementById('gmName').value = o.real_name; document.getElementById('gmPhone').value = o.phone || '';
    document.getElementById('gmIdCard').value = o.id_card || '';
    document.getElementById('guestModalOverlay').classList.remove('hidden')
  };

  window.Admin.saveGuest = async function () {
    var data = {
      real_name: document.getElementById('gmName').value.trim(), phone: document.getElementById('gmPhone').value.trim(),
      id_card: document.getElementById('gmIdCard').value.trim()
    };
    if (!data.real_name) return toast('姓名不能为空', 'error');
    if (!data.id_card) return toast('身份证不能为空', 'error');
    var r = await api('/guests/' + editingGuestId, 'PUT', data);
    if (r.code === 200) { closeGuestModal(); loadGuests(); toast(r.message || '保存成功', 'success') }
    else { toast(r.message, 'error') }
  };

  // ===== 客人详情 (入住记录) =====
  var currentGuestDetailsFilter = 'all';
  var allGuestDetailsCache = [];

  async function loadRoomOptions(selectId, selectedValue) {
    var r = await api('/rooms');
    var sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">未分配客房</option>';
    if (r.code === 200 && r.data) {
      r.data.forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.room_number + '号房 (' + (RM[o.room_type] || o.room_type) + ')';
        if (o.id === selectedValue) {
          opt.selected = true;
        }
        sel.appendChild(opt);
      });
    }
  }

  async function loadGuestDetails() {
    await ensureRoomTypes();
    var r = await api('/hotel-guests');
    if (r.code !== 200) return;
    allGuestDetailsCache = r.data || [];
    renderFilteredGuestDetails();
  }

  function renderFilteredGuestDetails() {
    var tb = document.getElementById('guestDetailsTableBody');
    if (!tb) return;
    
    var filtered = allGuestDetailsCache;

    if (filtered.length === 0) {
      tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-secondary)">暂无客人记录</td></tr>';
      return;
    }

    tb.innerHTML = filtered.map(function (o) {
      var roomInfo = o.room_number ? o.room_number + '号房 (' + (RM[o.room_type] || o.room_type || '') + ')' : '-';
      var account = esc(o.username || '-') + (o.user_nickname ? ' (' + esc(o.user_nickname) + ')' : '');

      var depositText = '-';
      if (o.deposit_status) {
        var dsLabel = DS[o.deposit_status] || o.deposit_status;
        var amountText = o.deposit_amount != null ? ' (¥' + esc(o.deposit_amount) + ')' : '';
        depositText = '<span class="status-tag status-' + esc(o.deposit_status) + '">' + esc(dsLabel) + amountText + '</span>';
      }

      return '<tr>' +
        '<td>' + esc(o.name || '-') + '</td>' +
        '<td>' + account + '</td>' +
        '<td>' + esc(maskPhone(o.phone)) + '</td>' +
        '<td>' + esc(maskIdCard(o.id_card)) + '</td>' +
        '<td>' + esc(o.ticket_type_label || '-') + '</td>' +
        '<td>' + esc(roomInfo) + '</td>' +
        '<td>' + depositText + '</td>' +
        '<td>' +
        '<button class="btn btn-sm btn-primary" onclick="Admin.editGuestDetail(' + o.id + ')">编辑</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="Admin.deleteGuestDetail(' + o.id + ')">删除</button>' +
        '</td>' +
        '</tr>';
    }).join('');
  }

  window.Admin.filterGuestDetails = function (status) {
    currentGuestDetailsFilter = status;
    document.querySelectorAll('#guestDetailsFilterTabs .filter-tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-status') === status);
    });
    renderFilteredGuestDetails();
  };

  window.Admin.editGuestDetail = async function (id) {
    editingGuestDetailId = id;
    var r = await api('/hotel-guests/' + id);
    if (r.code !== 200) return;
    var o = r.data;
    document.getElementById('guestDetailModalTitle').textContent = '编辑客人信息';
    document.getElementById('gdmName').value = o.name || '';
    document.getElementById('gdmPhone').value = o.phone || '';
    document.getElementById('gdmIdCard').value = o.id_card || '';
    
    await loadRoomOptions('gdmRoomId', o.room_id);
    
    document.getElementById('guestDetailModalOverlay').classList.remove('hidden')
  };

  window.Admin.saveGuestDetail = async function () {
    var data = {
      name: document.getElementById('gdmName').value.trim(),
      phone: document.getElementById('gdmPhone').value.trim(),
      id_card: document.getElementById('gdmIdCard').value.trim(),
      room_id: document.getElementById('gdmRoomId').value || null
    };
    if (!data.name) return toast('姓名不能为空', 'error');
    var r = await api('/hotel-guests/' + editingGuestDetailId, 'PUT', data);
    if (r.code === 200) {
      Admin.closeModal('guestDetailModalOverlay');
      loadGuestDetails();
      toast(r.message || '保存成功', 'success')
    } else {
      toast(r.message, 'error')
    }
  };

  window.Admin.checkoutGuest = async function (id) {
    if (!confirm('确认办理退房？')) return;
    var check_out = new Date().toISOString().slice(0, 19).replace('T', ' ');
    var r = await api('/hotel-guests/' + id, 'PUT', { status: 'checked_out', check_out: check_out });
    if (r.code === 200) {
      loadGuestDetails();
      toast('退房成功', 'success')
    } else {
      toast(r.message, 'error')
    }
  };

  window.Admin.deleteGuestDetail = async function (id) {
    if (!confirm('确认删除此入住记录？此操作不可逆！')) return;
    var r = await api('/hotel-guests/' + id, 'DELETE');
    if (r.code === 200) {
      loadGuestDetails();
      toast('删除成功', 'success')
    } else {
      toast(r.message, 'error')
    }
  };

  window.Admin.syncGuestsFromUsers = async function () {
    if (!confirm('确认从账号管理导入并同步所有实名登记的客人信息？')) return;
    var r = await api('/hotel-guests/sync', 'POST');
    if (r.code === 200) {
      loadGuestDetails();
      toast(r.message, 'success')
    } else {
      toast(r.message || '同步失败', 'error')
    }
  };

  window.Admin.exportToExcel = function () {
    if (!allGuestDetailsCache || allGuestDetailsCache.length === 0) {
      return toast('没有客人数据可供导出', 'error');
    }

    var headers = ['姓名', '账号', '手机号', '身份证号', '购票档次', '所住房间', '押金状态'];
    var csvRows = [];
    csvRows.push(headers.join(','));

    allGuestDetailsCache.forEach(function (o) {
      var roomInfo = o.room_number ? o.room_number + '号房 (' + (RM[o.room_type] || o.room_type || '') + ')' : '-';
      var account = (o.username || '-') + (o.user_nickname ? ' (' + o.user_nickname + ')' : '');

      var depositText = '-';
      if (o.deposit_status) {
        var dsLabel = DS[o.deposit_status] || o.deposit_status;
        var amountText = o.deposit_amount != null ? ' (¥' + o.deposit_amount + ')' : '';
        depositText = dsLabel + amountText;
      }

      var row = [
        o.name || '-',
        account,
        o.phone ? '\t' + o.phone : '-',
        o.id_card ? '\t' + o.id_card : '-',
        o.ticket_type_label || '-',
        roomInfo,
        depositText
      ];

      var escapedRow = row.map(function (val) {
        var str = String(val);
        if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
          str = '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      });

      csvRows.push(escapedRow.join(','));
    });

    var csvContent = '\uFEFF' + csvRows.join('\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', '客人信息登记表_' + new Date().toISOString().slice(0, 10) + '.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('导出成功', 'success');
  };

  // ===== 门票订单管理 =====
  async function loadOrders() {
    var params = new URLSearchParams(location.search);
    var statusParam = params.get('status');
    if (statusParam) {
      currentOrderFilter = statusParam;
      var tabs = document.querySelectorAll('#orderFilterTabs .filter-tab');
      if (tabs.length) {
        tabs.forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-status') === statusParam) });
      }
    }
    var r = await api('/orders');
    if (r.code !== 200) return;
    allOrdersCache = r.data || [];
    renderFilteredOrders();
    updatePendingBadge();
  }

  function renderFilteredOrders() {
    var list = allOrdersCache;
    if (currentOrderFilter !== 'all') {
      list = list.filter(function (o) { return o.status === currentOrderFilter });
    }
    var tb = document.getElementById('orderTableBody');
    tb.innerHTML = list.map(function (o) {
      return '<tr>' +
        '<td>' + esc(o.id) + '</td><td>' + esc(o.guest_name) + '</td><td>' + esc(o.guest_phone || '-') + '</td>' +
        '<td>' + esc(o.room_number || '-') + '</td>' +
        '<td>¥' + esc(o.total_price) + '</td>' +
        '<td><span class="status-tag status-' + esc(o.status) + '">' + esc(OrderStatus[o.status] || o.status) + '</span></td>' +
        '<td>' +
        (o.status === 'pending' ? '<button class="btn btn-sm btn-success" onclick="Admin.openApproveModal(' + o.id + ')">出票</button> ' : '') +
        ((o.status === 'approved' || o.status === 'confirmed' || o.status === 'checked_in') && !o.deposit_id ? '<button class="btn btn-sm btn-warning" onclick="Admin.showCollectDeposit(' + o.id + ',\'#' + esc(o.id) + ' ' + esc(o.guest_name) + '\')">收押金</button> ' : '') +
        '<button class="btn btn-sm btn-primary" onclick="Admin.editOrder(' + o.id + ')">编辑</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="Admin.deleteOrder(' + o.id + ')">删除</button>' +
        '</td></tr>'
    }).join('')
  }

  function updatePendingBadge() {
    var count = allOrdersCache.filter(function (o) { return o.status === 'pending' }).length;
    var badge = document.getElementById('pendingBadge');
    if (badge) badge.textContent = count > 0 ? count : '';
  }

  async function loadOrderRoomSelect(selectedRoomId) {
    await ensureRoomTypes();
    // 填充票型下拉
    var rtSel = document.getElementById('omRoomType');
    if (rtSel) {
      var rtRes = await api('/room-types');
      var rtList = (rtRes.code === 200 && rtRes.data) ? rtRes.data : [];
      rtSel.innerHTML = '<option value="">— 请选择票务套餐 —</option>' + rtList.map(function (t) {
        return '<option value="' + t.name + '" data-price="' + t.basePrice + '" data-is-pkg="' + (t.isRoomPackage ? '1' : '0') + '">'
          + t.label + ' | ¥' + t.basePrice + (t.isRoomPackage ? '（含住宿）' : '（仅限门票）') + '</option>';
      }).join('');
    }
    // 填充物理客房下拉
    var r = await api('/rooms');
    if (r.code !== 200) return;
    var sel = document.getElementById('omRoomId');
    sel.innerHTML = '<option value="">\u8bf7\u9009\u62e9</option>' + r.data.map(function (o) {
      return '<option value="' + o.id + '">' + o.room_number + ' (' + RM[o.room_type] + ') \u00a5' + o.price + '</option>'
    }).join('');
    if (selectedRoomId) sel.value = selectedRoomId;
    // 初始隐藏客房区域（未选票型时）
    var roomGroup = document.getElementById('omRoomGroup');
    if (roomGroup) roomGroup.style.display = 'none';
  }

  async function loadOrderUserSelect(selectedIds) {
    selectedIds = selectedIds || [];
    var r = await api('/users');
    var box = document.getElementById('omUserSelect');
    box.innerHTML = '';
    box._allUsers = [];
    if (r.code === 200 && r.data) {
      box._allUsers = r.data;
      renderOrderUsers(r.data, selectedIds);
    }
    document.getElementById('omUserSearch').value = '';
    updateUserSelectCount();
  }

  function renderOrderUsers(users, selectedIds) {
    selectedIds = selectedIds || getSelectedUserIds();
    var box = document.getElementById('omUserSelect');
    box.innerHTML = '';
    if (users.length === 0) {
      box.innerHTML = '<div class="multi-select-empty">无匹配用户</div>';
      return;
    }
    users.forEach(function (u) {
      var label = document.createElement('label');
      label.className = 'multi-select-item' + (selectedIds.indexOf(u.id) !== -1 ? ' checked' : '');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = u.id;
      cb.dataset.nickname = u.nickname || u.username;
      cb.dataset.phone = u.phone || '';
      if (selectedIds.indexOf(u.id) !== -1) cb.checked = true;
      cb.addEventListener('change', function () {
        label.classList.toggle('checked', cb.checked);
        updateUserSelectCount();
      });
      var info = document.createElement('div');
      info.className = 'user-info';
      var nameSpan = document.createElement('span');
      nameSpan.className = 'user-name';
      nameSpan.textContent = u.nickname || u.username;
      info.appendChild(nameSpan);
      var detail = u.phone || '';
      if (u.id_card) detail += (detail ? ' · ' : '') + u.id_card.replace(/^(.{6})(.*)(.{4})$/, '$1****$3');
      if (detail) {
        var detailSpan = document.createElement('span');
        detailSpan.className = 'user-detail';
        detailSpan.textContent = detail;
        info.appendChild(detailSpan);
      }
      label.appendChild(cb);
      label.appendChild(info);
      box.appendChild(label);
    });
  }

  function filterOrderUsers() {
    var keyword = document.getElementById('omUserSearch').value.trim().toLowerCase();
    var box = document.getElementById('omUserSelect');
    var allUsers = box._allUsers || [];
    var selectedIds = getSelectedUserIds();
    if (!keyword) {
      renderOrderUsers(allUsers, selectedIds);
      return;
    }
    var filtered = allUsers.filter(function (u) {
      var name = (u.nickname || u.username || '').toLowerCase();
      var phone = (u.phone || '').toLowerCase();
      var realName = (u.real_name || '').toLowerCase();
      return name.indexOf(keyword) !== -1 || phone.indexOf(keyword) !== -1 || realName.indexOf(keyword) !== -1;
    });
    renderOrderUsers(filtered, selectedIds);
  }

  function updateUserSelectCount() {
    var count = getSelectedUserIds().length;
    var el = document.getElementById('omUserCount');
    el.textContent = count > 0 ? ('已选 ' + count + ' 人') : '';
  }

  function getSelectedUserIds() {
    var box = document.getElementById('omUserSelect');
    var ids = [];
    box.querySelectorAll('input[type=checkbox]:checked').forEach(function (cb) {
      ids.push(parseInt(cb.value));
    });
    return ids;
  }

  function showOrderModal() {
    editingOrderId = null;
    document.getElementById('orderModalTitle').textContent = '新建门票订单 (提交申请)';
    document.getElementById('omPrice').value = '0';
    document.getElementById('omRemark').value = '';
    var area = document.getElementById('omPriceRoomArea');
    if (area) area.style.display = 'none';
    loadOrderRoomSelect(null); loadOrderUserSelect(); document.getElementById('orderModalOverlay').classList.remove('hidden')
  }
  function closeOrderModal() { document.getElementById('orderModalOverlay').classList.add('hidden') }

  // 切换票型时加载价格 + 显示/隐藏客房区域
  window.Admin.onOrderTypeChange = async function (keepPrice) {
    var rtSel = document.getElementById('omRoomType');
    var roomGroup = document.getElementById('omRoomGroup');
    if (!rtSel) return;
    var roomType = rtSel.value;
    if (!roomType) {
      if (roomGroup) roomGroup.style.display = 'none';
      return;
    }
    var opt = rtSel.options[rtSel.selectedIndex];
    var price = opt && opt.dataset.price ? parseFloat(opt.dataset.price) : null;
    if (!keepPrice && price !== null) document.getElementById('omPrice').value = price;
    // 显示/隐藏客房区域
    var isPkg = opt && opt.dataset.isPkg === '1';
    if (roomGroup) roomGroup.style.display = isPkg ? '' : 'none';
    if (!isPkg && document.getElementById('omRoomId')) document.getElementById('omRoomId').value = '';
  };

  window.Admin.deleteOrder = async function (id) {
    if (!confirm('确定删除该门票订单？')) return;
    var r = await api('/orders/' + id, 'DELETE');
    if (r.code === 200) { loadOrders(); toast('删除成功', 'success') }
    else { toast(r.message || '删除失败', 'error') }
  };

  window.Admin.editOrder = async function (id) {
    editingOrderId = id;
    var r = await api('/orders/' + id);
    if (r.code !== 200) return;
    var o = r.data;
    document.getElementById('orderModalTitle').textContent = '编辑门票订单';
    document.getElementById('omPrice').value = o.total_price;
    document.getElementById('omRemark').value = o.remark || '';
    var area = document.getElementById('omPriceRoomArea');
    if (area) area.style.display = 'flex';
    loadOrderRoomSelect(o.room_id);
    setTimeout(function () {
      var rtSel = document.getElementById('omRoomType');
      if (rtSel && o.room_type) { rtSel.value = o.room_type; Admin.onOrderTypeChange(true); }
    }, 300);
    var guestIds = (o.guest_users || []).map(function (g) { return g.user_id });
    loadOrderUserSelect(guestIds);
    document.getElementById('orderModalOverlay').classList.remove('hidden')
  };

  window.Admin.saveOrder = async function () {
    var userIds = getSelectedUserIds();
    if (userIds.length === 0) return toast('请选择至少一位持票人', 'error');
    var firstCb = document.querySelector('#omUserSelect input[type=checkbox]:checked');
    var guestName = firstCb ? firstCb.dataset.nickname : '';
    var guestPhone = firstCb ? firstCb.dataset.phone : '';
    var rtSel = document.getElementById('omRoomType');
    var roomType = rtSel ? rtSel.value : '';
    if (!roomType) return toast('请选择票务套餐', 'error');

    var data = {
      guest_name: guestName,
      guest_phone: guestPhone,
      user_id: userIds[0],
      guest_user_ids: userIds,
      guests: userIds.length,
      room_type: roomType,
      room_id: editingOrderId ? (document.getElementById('omRoomId').value ? parseInt(document.getElementById('omRoomId').value) : null) : null,
      total_price: editingOrderId ? (parseFloat(document.getElementById('omPrice').value) || 0) : 0,
      remark: document.getElementById('omRemark').value.trim()
    };
    var r;
    if (editingOrderId) { r = await api('/orders/' + editingOrderId, 'PUT', data) }
    else { r = await api('/orders', 'POST', data) }
    if (r.code === 200 || r.code === 201) { closeOrderModal(); loadOrders(); toast(r.message || '保存成功', 'success') }
    else { toast(r.message, 'error') }
  };

  // ===== 在线核验 =====
  var html5QrCode = null;
  var scannerActive = false;

  window.switchVerifyMode = function (mode) {
    document.querySelectorAll('.verify-tab').forEach(function (t) { t.classList.remove('active'); });
    document.getElementById('verifyScanArea').classList.add('hidden');
    document.getElementById('verifyFileArea').classList.add('hidden');
    document.getElementById('verifyManualArea').classList.add('hidden');
    if (mode === 'scan') {
      document.querySelectorAll('.verify-tab')[0].classList.add('active');
      document.getElementById('verifyScanArea').classList.remove('hidden');
    } else if (mode === 'file') {
      document.querySelectorAll('.verify-tab')[1].classList.add('active');
      document.getElementById('verifyFileArea').classList.remove('hidden');
      stopScanner();
    } else {
      document.querySelectorAll('.verify-tab')[2].classList.add('active');
      document.getElementById('verifyManualArea').classList.remove('hidden');
      stopScanner();
    }
  };

  window.startScannerManual = function () {
    startScanner();
  };

  function startScanner() {
    if (scannerActive) return;
    var el = document.getElementById('qrReader');
    el.innerHTML = '';
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode('qrReader');
    }
    var config = {
      fps: 10, qrbox: { width: 250, height: 150 }, formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
      ]
    };
    html5QrCode.start(
      { facingMode: 'environment' },
      config,
      function (decodedText) {
        scannerActive = false;
        html5QrCode.stop().then(function () {
          document.getElementById('btnStopScan').style.display = 'none';
          document.getElementById('btnStartScan').style.display = 'inline-block';
          document.getElementById('verifyOrderId').value = decodedText;
          document.getElementById('verifyResult').innerHTML =
            '<div class="scan-result">📷 识别结果:  <strong>' + decodedText + '</strong></div>';
          doVerifyFromInput();
        }).catch(function () { });
      },
      function () { }
    ).then(function () {
      scannerActive = true;
      document.getElementById('btnStartScan').style.display = 'none';
      document.getElementById('btnStopScan').style.display = 'inline-block';
    }).catch(function (err) {
      document.getElementById('qrReader').innerHTML =
        '<div class="scan-error">❌ 无法启动摄像头<br><small>' + esc(err.message || err) + '</small><br><p>请切换到"手动输入"模式或允许摄像头权限</p></div>';
    });
  }

  window.stopScanner = function () {
    if (html5QrCode && scannerActive) {
      html5QrCode.stop().then(function () {
        scannerActive = false;
        document.getElementById('btnStopScan').style.display = 'none';
        document.getElementById('btnStartScan').style.display = 'inline-block';
      }).catch(function () { });
    }
  };

  // 拍照识别二维码
  (function () {
    var fileInput = document.getElementById('verifyFileInput');
    if (!fileInput) return;
    fileInput.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      // 使用独立的隐藏容器，避免与摄像头扫码冲突
      var containerId = 'fileScanContainer';
      var container = document.getElementById(containerId);
      container.style.display = 'block';
      container.innerHTML = '';

      // 先压缩/处理图片再识别（手机拍照分辨率太高会导致识别失败）
      var reader = new FileReader();
      reader.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
          // 缩放到合适大小（最大边 800px）
          var maxSize = 800;
          var w = img.width, h = img.height;
          if (w > maxSize || h > maxSize) {
            if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
            else { w = Math.round(w * maxSize / h); h = maxSize; }
          }
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(function (blob) {
            var processedFile = new File([blob], 'scan.png', { type: 'image/png' });
            var tempScanner = new Html5Qrcode(containerId);
            tempScanner.scanFile(processedFile, true).then(function (decodedText) {
              container.style.display = 'none';
              container.innerHTML = '';
              tempScanner.clear();
              document.getElementById('verifyOrderId').value = decodedText;
              document.getElementById('verifyResult').innerHTML =
                '<div class="scan-result">📷 识别结果: <strong>' + decodedText + '</strong></div>';
              doVerifyFromInput();
            }).catch(function (err) {
              container.style.display = 'none';
              container.innerHTML = '';
              try { tempScanner.clear(); } catch (ex) { }
              console.warn('图片二维码识别失败:', err);
              document.getElementById('verifyResult').innerHTML =
                '<div class="verify-fail">❌ 无法从图片中识别二维码<br><small style="color:var(--text-secondary)">请确保拍摄清晰、正对二维码，或使用手动输入</small></div>';
            });
          }, 'image/png');
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });
  })();

  window.doVerifyFromInput = function () {
    var orderId = document.getElementById('verifyOrderId').value.trim();
    if (!orderId) return toast('请输入订单 ID 或扫描二维码', 'error');
    // 如果扫码结果是 URL 或复杂内容，尝试提取数字
    var match = orderId.match(/(\d+)/);
    if (match) orderId = match[1];
    document.getElementById('verifyOrderId').value = orderId;
    doVerifyById(orderId);
  };

  async function doVerifyById(orderId) {
    var resOrder = await api('/orders/' + orderId);
    var box = document.getElementById('verifyResult');
    if (resOrder.code !== 200) {
      box.innerHTML = '<div class="verify-fail">订单 #' + orderId + ' 不存在</div>';
      return;
    }
    var o = resOrder.data;
    box.innerHTML =
      '<div class="result-box' + (o.status === 'confirmed' || o.status === 'completed' ? ' success' : '') + '">' +
      '<p><strong>订单 #' + o.id + '</strong></p>' +
      '<p>客人: ' + o.guest_name + ' | 席位: ' + (o.room_number || '-') + '</p>' +
      '<p>金额: ¥' + o.total_price + '</p>' +
      '<p>状态:  <span class="status-tag status-' + o.status + '">' + (OrderStatus[o.status] || o.status) + '</span></p>' +
      '</div>' +
      (o.status === 'confirmed' || o.status === 'completed'
        ? '<div class="verify-done">\u2713 该订单已验票</div>'
        : '<button class="btn btn-success" onclick="Admin.verifyOrder(' + o.id + ')" style="margin-top:12px">确认核销入场</button>');
  }

  window.Admin.verifyOrder = async function (id) {
    // 获取订单信息展示在弹窗中
    var r = await api('/orders/' + id);
    if (r.code !== 200) return toast('获取订单信息失败', 'error');
    var o = r.data;
    document.getElementById('vmOrderId').value = id;
    document.getElementById('vmOrderInfo').textContent = '#' + o.id + ' ' + o.guest_name + ' | 席位: ' + (o.room_number || '-');
    document.getElementById('vmDeposit').value = '0';
    document.getElementById('vmNote').value = '';
    document.getElementById('verifyModalOverlay').classList.remove('hidden');
  };

  window.Admin.confirmVerify = async function () {
    var id = document.getElementById('vmOrderId').value;
    var deposit = parseFloat(document.getElementById('vmDeposit').value) || 0;
    var note = document.getElementById('vmNote').value.trim();
    var r = await api('/verify', 'POST', { order_id: parseInt(id), result: 'success', note: note, deposit_amount: deposit });
    if (r.code === 200) {
      Admin.closeModal('verifyModalOverlay');
      loadOrders();
      toast('验票核销成功' + (deposit > 0 ? '，已收取押金 ¥' + deposit : ''), 'success');
      doVerifyById(id);
    } else { toast(r.message, 'error'); }
  };

  window.Admin.showCollectDeposit = function (id, info) {
    document.getElementById('cdOrderId').value = id;
    document.getElementById('cdOrderInfo').textContent = info;
    document.getElementById('cdAmount').value = '0';
    document.getElementById('collectDepositModalOverlay').classList.remove('hidden');
  };

  window.Admin.collectDeposit = async function () {
    var id = document.getElementById('cdOrderId').value;
    var amount = parseFloat(document.getElementById('cdAmount').value) || 0;
    if (amount <= 0) return toast('押金金额必须大于 0', 'error');
    var r = await api('/deposits', 'POST', { order_id: parseInt(id), amount: amount });
    if (r.code === 200) {
      Admin.closeModal('collectDepositModalOverlay');
      loadOrders();
      loadDeposits();
      toast('押金收取成功 ¥' + amount, 'success');
    } else { toast(r.message, 'error'); }
  };

  window.Admin.approveOrder = async function (id) {
    Admin.openApproveModal(id);
  };

  window.Admin.rejectOrder = async function (id) {
    Admin.openApproveModal(id);
  };

  window.Admin.openApproveModal = async function (id) {
    var order = allOrdersCache.find(function (o) { return o.id === id });
    if (!order) return toast('订单不存在', 'error');
    approveTargetOrder = order;
    document.getElementById('approveOrderId').value = id;
    document.getElementById('approveOrderNo').textContent = '#' + id;
    document.getElementById('approveGuest').textContent = order.guest_name || '--';
    document.getElementById('approvePhone').textContent = order.guest_phone || '--';
    var packageLabel = RM[order.room_type] || order.room_type_label || order.room_type || '--';
    document.getElementById('approveRoomType').textContent = packageLabel;
    document.getElementById('approvePrice').textContent = '¥' + (order.total_price || '待定');
    var remarkRow = document.getElementById('approveRemarkRow');
    if (order.remark) { remarkRow.style.display = ''; document.getElementById('approveRemark').textContent = order.remark }
    else { remarkRow.style.display = 'none' }
    document.getElementById('approveNote').value = '';
    document.getElementById('rejectReason').value = '';
    document.getElementById('rejectArea').classList.add('hidden');
    document.getElementById('approveConfirmBtn').style.display = '';
    var rejectBtn = document.getElementById('approveRejectBtn');
    if(rejectBtn) {
        rejectBtn.style.display = '';
        rejectBtn.textContent = '拒绝';
        rejectBtn.onclick = Admin.showRejectArea;
    }
    // 判断门票套餐是否为住宿套票
    await ensureRoomTypes();
    var rtRes = await api('/room-types');
    var ticketPackage = (rtRes.code === 200 && rtRes.data) ? rtRes.data.find(function (t) { return t.name === order.room_type }) : null;
    var isRoomPkg = ticketPackage ? ticketPackage.isRoomPackage : false;
    var hrtName = ticketPackage ? ticketPackage.hotelRoomType : null;

    var r = await api('/rooms');
    var sel = document.getElementById('approveRoomSelect');
    var targetType = isRoomPkg ? hrtName : ticketPackage.name;
    sel.disabled = false;
    if (order.room_id && order.room_number) {
      sel.innerHTML = '<option value="" selected>使用已分配席位/客房: ' + esc(order.room_number) + '</option>';
    } else {
      sel.innerHTML = '<option value="">自动分配（系统选择第一个可用席位/客房）</option>';
    }
    if (r.code === 200 && r.data) {
      r.data.filter(function (rm) {
        var isSameType = !targetType || rm.room_type === targetType;
        var capacity = rm.capacity || 1;
        var hasCapacity = (capacity - rm.current_occupants) >= (order.guests || 1);
        return isSameType && hasCapacity;
      }).forEach(function (rm) {
        var capacity = rm.capacity || 1;
        sel.innerHTML += '<option value="' + rm.id + '">' + esc(rm.room_number) + ' (' + esc(RM[rm.room_type] || rm.room_type) + ') 剩余:' + (capacity - rm.current_occupants) + '人</option>';
      });
    }
    document.getElementById('approveModalOverlay').classList.remove('hidden');
  };

  window.Admin.showRejectArea = function () {
    document.getElementById('rejectArea').classList.remove('hidden');
    document.getElementById('approveConfirmBtn').style.display = 'none';
    var rejectBtn = document.getElementById('approveRejectBtn');
    if(rejectBtn) {
        rejectBtn.textContent = '确认拒绝';
        rejectBtn.onclick = Admin.confirmReject;
    }
  };

  window.Admin.confirmApprove = async function () {
    var id = document.getElementById('approveOrderId').value;
    var room_id = document.getElementById('approveRoomSelect').value || undefined;
    var note = document.getElementById('approveNote').value.trim() || undefined;
    var body = {};
    if (room_id) body.room_id = parseInt(room_id);
    if (note) body.note = note;
    var r = await api('/orders/' + id + '/approve', 'POST', body);
    if (r.code === 200) {
      Admin.closeModal('approveModalOverlay');
      loadOrders();
      toast('出票通过，已分配座位 ' + (r.data.room_number || ''), 'success');
    } else { toast(r.message, 'error'); }
  };

  window.Admin.confirmReject = async function () {
    var id = document.getElementById('approveOrderId').value;
    var reason = document.getElementById('rejectReason').value.trim() || undefined;
    var body = {};
    if (reason) body.reason = reason;
    var r = await api('/orders/' + id + '/reject', 'POST', body);
    if (r.code === 200) {
      Admin.closeModal('approveModalOverlay');
      loadOrders();
      toast('已拒绝该购票申请', 'success');
    } else { toast(r.message, 'error'); }
  };

  window.Admin.filterOrders = function (status) {
    currentOrderFilter = status;
    var tabs = document.querySelectorAll('#orderFilterTabs .filter-tab');
    tabs.forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-status') === status) });
    renderFilteredOrders();
  };

  window.Admin.gotoPendingOrders = function () {
    location.href = 'admin-orders.html?status=pending';
  };

  window.Admin.doVerify = function () {
    doVerifyFromInput();
  };

  window.Admin.closeModal = function (id) { document.getElementById(id).classList.add('hidden') };

  document.getElementById('logoutBtn')?.addEventListener('click', function () {
    if (typeof showLogoutModal === 'function') {
      showLogoutModal({
        title: '退出管理后台',
        message: '确定要退出管理后台登录吗？',
        onConfirm: function () {
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_user');
          location.href = 'admin-login.html';
        }
      });
    } else {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      location.href = 'admin-login.html';
    }
  });

  window.showRoomModal = showRoomModal; window.closeRoomModal = closeRoomModal;
  window.closeGuestModal = closeGuestModal;
  window.showOrderModal = showOrderModal; window.closeOrderModal = closeOrderModal;
  window.filterOrderUsers = filterOrderUsers;

  // ===== 账号管理 =====
  async function loadUsers() {
    var r = await api('/users');
    var tb = document.getElementById('userTableBody');
    if (r.code !== 200) return;
    var roleMap = { admin: '管理员', staff: 'STAFF', guest: '普通用户' };
    var statusMap = { active: '正常', pending: '待审核' };
    var pendingCount = 0;
    tb.innerHTML = r.data.map(function (u) {
      var st = u.status || 'active';
      if (st === 'pending') pendingCount++;
      var statusClass = st === 'pending' ? ' style="color:#e67e22;font-weight:600"' : '';
      var actions = '<button class="btn btn-sm btn-primary" onclick="Admin.showPasswordModal(' + u.id + ',this)" data-username="' + esc(u.username) + '">修改密码</button> ';
      if (st === 'pending') {
        actions += '<button class="btn btn-sm btn-primary" onclick="Admin.approveUser(' + u.id + ')">通过</button> ';
        actions += '<button class="btn btn-sm btn-danger" onclick="Admin.rejectUser(' + u.id + ',\'' + esc(u.username) + '\')">拒绝</button> ';
      }
      actions += '<button class="btn btn-sm btn-danger" onclick="Admin.deleteUser(' + u.id + ',this)" data-username="' + esc(u.username) + '">删除</button>';
      var roleSelect = '<select style="padding:3px 8px;border-radius:6px;border:1px solid var(--border);font-size:12px;background:var(--card-bg);color:var(--text);cursor:pointer;" onchange="Admin.changeUserRole(' + u.id + ', this.value)">' +
        '<option value="guest"' + (u.role === 'guest' ? ' selected' : '') + '>普通用户</option>' +
        '<option value="staff"' + (u.role === 'staff' ? ' selected' : '') + '>STAFF</option>' +
        '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>管理员</option>' +
      '</select>';
      return '<tr>' +
        '<td>' + esc(u.id) + '</td><td>' + esc(u.username) + '</td><td>' + esc(u.nickname) + '</td><td>' + esc(u.phone || '-') + '</td>' +
        '<td>' + roleSelect + '</td><td' + statusClass + '>' + esc(statusMap[st] || st) + '</td><td>' + esc(u.created_at) + '</td>' +
        '<td>' + actions + '</td></tr>'
    }).join('');
    // 待审核提示栏
    var bar = document.getElementById('pendingUsersBar');
    if (bar) {
      if (pendingCount > 0) { bar.style.display = 'flex'; document.getElementById('pendingUsersCount').textContent = pendingCount }
      else { bar.style.display = 'none' }
    }
  }

  window.Admin.changeUserRole = async function (id, newRole) {
    var r = await api('/users/' + id, 'PUT', { role: newRole });
    if (r.code === 200) {
      toast('角色修改成功', 'success');
      loadUsers();
    } else {
      toast(r.message || '角色修改失败', 'error');
    }
  };

  window.Admin.showPasswordModal = function (id, btn) {
    var username = btn ? btn.getAttribute('data-username') : '';
    document.getElementById('pwUserId').value = id;
    document.getElementById('pwUsername').textContent = username;
    document.getElementById('pwNew').value = '';
    document.getElementById('pwConfirm').value = '';
    document.getElementById('passwordModalOverlay').classList.remove('hidden')
  };

  window.Admin.changePassword = async function () {
    var id = document.getElementById('pwUserId').value;
    var pw = document.getElementById('pwNew').value;
    var cf = document.getElementById('pwConfirm').value;
    if (!pw || pw.length < 6) return toast('密码至少6位', 'error');
    if (pw !== cf) return toast('两次密码不一致', 'error');
    var r = await api('/users/' + id + '/password', 'PUT', { password: pw });
    if (r.code === 200) { Admin.closeModal('passwordModalOverlay'); toast('密码修改成功', 'success') }
    else { toast(r.message, 'error') }
  };

  window.showAddUserModal = function () {
    document.getElementById('auUsername').value = '';
    document.getElementById('auPassword').value = '';
    document.getElementById('auNickname').value = '';
    document.getElementById('auPhone').value = '';
    document.getElementById('auRole').value = 'guest';
    document.getElementById('addUserModalOverlay').classList.remove('hidden')
  };

  window.Admin.createUser = async function () {
    var data = {
      username: document.getElementById('auUsername').value.trim(),
      password: document.getElementById('auPassword').value,
      nickname: document.getElementById('auNickname').value.trim(),
      phone: document.getElementById('auPhone').value.trim(),
      role: document.getElementById('auRole').value
    };
    if (!data.username || !data.password) return toast('用户名和密码不能为空', 'error');
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(data.username)) return toast('用户名需3-20位字母数字或下划线', 'error');
    if (data.password.length < 6) return toast('密码至少6位', 'error');
    var r = await api('/users', 'POST', data);
    if (r.code === 201) { Admin.closeModal('addUserModalOverlay'); loadUsers(); toast('创建成功', 'success') }
    else { toast(r.message, 'error') }
  };

  window.Admin.deleteUser = async function (id, btn) {
    var username = btn ? btn.getAttribute('data-username') : '该用户';
    if (!confirm('确定要删除用户 "' + username + '" 吗？此操作不可恢复！')) return;
    var r = await api('/users/' + id, 'DELETE');
    if (r.code === 200) { loadUsers(); toast('删除成功', 'success') }
    else { toast(r.message, 'error') }
  };

  async function loadSettings() {
    var r = await api('/settings');
    if (r.code !== 200) return;
    var data = r.data || {};
    document.getElementById('settingBookingOpen').checked = (data.booking_open === '1');
    var maxTicketsInput = document.getElementById('settingMaxTickets');
    if (maxTicketsInput) maxTicketsInput.value = data.max_tickets_per_user || '1';
    var timeoutInput = document.getElementById('settingSessionTimeout');
    if (timeoutInput) timeoutInput.value = data.session_timeout_minutes || '480';
    var modeSelect = document.getElementById('settingRegistrationMode');
    if (modeSelect) modeSelect.value = data.registration_mode || 'open';
    var titleInput = document.getElementById('settingSiteTitle');
    if (titleInput) titleInput.value = data.site_title || '';
    var subtitleInput = document.getElementById('settingSiteSubtitle');
    if (subtitleInput) subtitleInput.value = data.site_subtitle || '';
    var copyrightInput = document.getElementById('settingCopyrightText');
    if (copyrightInput) copyrightInput.value = data.copyright_text || '';
  }

  window.Admin.saveMaxTickets = async function () {
    var val = document.getElementById('settingMaxTickets').value;
    var num = parseInt(val);
    if (isNaN(num) || num < 1) { return toast('单人购票上限须大于等于 1', 'error') }
    var r = await api('/settings', 'PUT', { max_tickets_per_user: num });
    if (r.code === 200) { toast('购票上限已保存', 'success') }
    else { toast(r.message, 'error') }
  };

  window.Admin.toggleBooking = async function (checked) {
    var r = await api('/settings', 'PUT', { booking_open: checked ? '1' : '0' });
    if (r.code === 200) { toast(checked ? '已开放购票' : '已关闭购票', 'success') }
    else { toast(r.message, 'error'); document.getElementById('settingBookingOpen').checked = !checked }
  };

  window.Admin.saveSessionTimeout = async function () {
    var val = document.getElementById('settingSessionTimeout').value;
    var num = parseInt(val);
    if (isNaN(num) || num < 5 || num > 10080) { return toast('超时时间须在5-10080分钟之间', 'error') }
    var r = await api('/settings', 'PUT', { session_timeout_minutes: num });
    if (r.code === 200) { toast('超时设置已保存', 'success'); sessionTimeoutMinutes = num; startRefreshTimer() }
    else { toast(r.message, 'error') }
  };

  window.Admin.saveSiteInfo = async function () {
    var site_title = document.getElementById('settingSiteTitle').value.trim();
    var site_subtitle = document.getElementById('settingSiteSubtitle').value.trim();
    var copyright_text = document.getElementById('settingCopyrightText').value.trim();
    var r = await api('/settings', 'PUT', { site_title: site_title, site_subtitle: site_subtitle, copyright_text: copyright_text });
    if (r.code === 200) { toast('网站信息已保存', 'success') }
    else { toast(r.message, 'error') }
  };

  // ===== 注册模式 =====
  window.Admin.saveRegistrationMode = async function () {
    var mode = document.getElementById('settingRegistrationMode').value;
    var r = await api('/settings', 'PUT', { registration_mode: mode });
    if (r.code === 200) { toast('注册模式已更新', 'success') }
    else { toast(r.message, 'error') }
  };

  // ===== 用户审核 =====
  window.Admin.approveUser = async function (id) {
    if (!confirm('确定通过该用户的注册申请？')) return;
    var r = await api('/users/' + id + '/approve', 'POST');
    if (r.code === 200) { loadUsers(); toast('用户已通过审核', 'success') }
    else { toast(r.message, 'error') }
  };

  window.Admin.rejectUser = async function (id, username) {
    if (!confirm('确定拒绝并删除用户 "' + (username || '') + '" 的注册申请？')) return;
    var r = await api('/users/' + id + '/reject', 'POST');
    if (r.code === 200) { loadUsers(); toast('用户已被拒绝', 'success') }
    else { toast(r.message, 'error') }
  };

  window.Admin.showPendingUsers = async function () {
    var r = await api('/pending-users');
    var list = document.getElementById('pendingUsersList');
    if (r.code !== 200) { toast(r.message, 'error'); return }
    if (!r.data || r.data.length === 0) { list.innerHTML = '<p style="text-align:center;color:#666;padding:20px">暂无待审核用户</p>'; document.getElementById('pendingUsersModalOverlay').classList.remove('hidden'); return }
    list.innerHTML = r.data.map(function (u) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid #eee">' +
        '<div><strong>' + esc(u.username) + '</strong> <span style="color:#666">(' + esc(u.nickname || '-') + ')</span><br><small>手机: ' + esc(u.phone || '-') + ' | 注册: ' + esc(u.created_at) + '</small></div>' +
        '<div style="display:flex;gap:8px"><button class="btn btn-sm btn-primary" onclick="Admin.approveUser(' + u.id + ');Admin.closeModal(\'pendingUsersModalOverlay\')">通过</button>' +
        '<button class="btn btn-sm btn-danger" onclick="Admin.rejectUser(' + u.id + ',\'' + esc(u.username) + '\');Admin.closeModal(\'pendingUsersModalOverlay\')">拒绝</button></div></div>'
    }).join('');
    document.getElementById('pendingUsersModalOverlay').classList.remove('hidden');
  };

  // ===== 邀请码管理 =====
  async function loadInviteCodes() {
    var r = await api('/invite-codes');
    var tb = document.getElementById('inviteCodeTableBody');
    if (r.code !== 200) return;
    var statusMap = { active: '有效', disabled: '已禁用' };
    tb.innerHTML = r.data.map(function (c) {
      var isExpired = c.expires_at && new Date(c.expires_at) < new Date();
      var isExhausted = c.max_uses > 0 && c.use_count >= c.max_uses;
      var displayStatus = isExpired ? '已过期' : isExhausted ? '已用完' : statusMap[c.status] || c.status;
      var statusStyle = (c.status === 'disabled' || isExpired || isExhausted) ? ' style="color:#999"' : '';
      var toggleBtn = c.status === 'active' ?
        '<button class="btn btn-sm btn-outline" onclick="Admin.toggleInviteCode(' + c.id + ',\'disabled\')">禁用</button>' :
        '<button class="btn btn-sm btn-primary" onclick="Admin.toggleInviteCode(' + c.id + ',\'active\')">启用</button>';
      return '<tr' + statusStyle + '>' +
        '<td>' + c.id + '</td>' +
        '<td><code style="background:#f5f5f5;padding:2px 6px;border-radius:4px;user-select:all">' + esc(c.code) + '</code> <button class="btn btn-sm btn-outline" onclick="Admin.copyInviteCode(\'' + esc(c.code) + '\')" style="padding:2px 6px;font-size:11px">复制</button></td>' +
        '<td>' + c.use_count + '/' + c.max_uses + '</td>' +
        '<td>' + displayStatus + '</td>' +
        '<td>' + (c.expires_at || '永不过期') + '</td>' +
        '<td>' + esc(c.created_at) + '</td>' +
        '<td>' + toggleBtn + ' <button class="btn btn-sm btn-danger" onclick="Admin.deleteInviteCode(' + c.id + ')">删除</button></td>' +
        '</tr>'
    }).join('');
  }

  window.Admin.showGenerateInviteModal = function () {
    document.getElementById('inviteCount').value = '1';
    document.getElementById('inviteMaxUses').value = '1';
    document.getElementById('inviteExpiresHours').value = '';
    document.getElementById('generateInviteModalOverlay').classList.remove('hidden');
  };

  window.Admin.generateInviteCodes = async function () {
    var count = parseInt(document.getElementById('inviteCount').value) || 1;
    var max_uses = parseInt(document.getElementById('inviteMaxUses').value) || 1;
    var expires_hours = document.getElementById('inviteExpiresHours').value.trim();
    var body = { count: count, max_uses: max_uses };
    if (expires_hours) body.expires_hours = parseInt(expires_hours);
    var r = await api('/invite-codes', 'POST', body);
    if (r.code === 201) {
      Admin.closeModal('generateInviteModalOverlay');
      loadInviteCodes();
      toast(r.message, 'success');
    } else { toast(r.message, 'error') }
  };

  window.Admin.copyInviteCode = function (code) {
    if (navigator.clipboard) { navigator.clipboard.writeText(code).then(function () { toast('已复制到剪贴板', 'success') }) }
    else { var ta = document.createElement('textarea'); ta.value = code; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast('已复制到剪贴板', 'success') }
  };

  window.Admin.toggleInviteCode = async function (id, status) {
    var r = await api('/invite-codes/' + id, 'PUT', { status: status });
    if (r.code === 200) { loadInviteCodes(); toast('状态已更新', 'success') }
    else { toast(r.message, 'error') }
  };

  window.Admin.deleteInviteCode = async function (id) {
    if (!confirm('确定要删除该邀请码吗？')) return;
    var r = await api('/invite-codes/' + id, 'DELETE');
    if (r.code === 200) { loadInviteCodes(); toast('邀请码已删除', 'success') }
    else { toast(r.message, 'error') }
  };

  // ===== 客房房型管理 =====
  async function loadHotelRoomTypes() {
    var r = await api('/hotel-room-types');
    var tb = document.getElementById('hotelRoomTypeTableBody');
    if (r.code !== 200) { tb.innerHTML = '<tr><td colspan="5">加载失败</td></tr>'; return }
    var list = r.data || [];
    if (list.length === 0) {
      tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary)">暂无客房房型</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (t) {
      return '<tr>' +
        '<td>' + esc(t.label) + ' <small style="color:var(--text-secondary)">(' + esc(t.name) + ')</small></td>' +
        '<td>¥' + esc(t.basePrice) + '</td>' +
        '<td>' + esc(t.capacity) + '人</td>' +
        '<td>' + esc(t.description || '-') + '</td>' +
        '<td>' +
        '<button class="btn btn-sm" onclick="Admin.editHotelRoomType(' + t.id + ')">编辑</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="Admin.deleteHotelRoomType(' + t.id + ')">删除</button>' +
        '</td>' +
        '</tr>'
    }).join('')
  }

  var editingHotelRoomTypeId = null;
  window.showHotelRoomTypeModal = function () {
    editingHotelRoomTypeId = null;
    document.getElementById('hotelRoomTypeModalTitle').textContent = '添加客房房型';
    document.getElementById('hrtName').value = '';
    document.getElementById('hrtName').disabled = false;
    document.getElementById('hrtLabel').value = '';
    document.getElementById('hrtBasePrice').value = '388';
    document.getElementById('hrtDeposit').value = '100';
    document.getElementById('hrtCapacity').value = '2';
    document.getElementById('hrtDesc').value = '';
    document.getElementById('hotelRoomTypeModalOverlay').classList.remove('hidden')
  };

  window.Admin.editHotelRoomType = async function (id) {
    editingHotelRoomTypeId = id;
    var r = await api('/hotel-room-types/' + id);
    if (r.code !== 200) return toast(r.message || '获取失败', 'error');
    var o = r.data;
    document.getElementById('hotelRoomTypeModalTitle').textContent = '编辑客房房型';
    document.getElementById('hrtName').value = o.name || '';
    document.getElementById('hrtName').disabled = true;
    document.getElementById('hrtLabel').value = o.label || '';
    document.getElementById('hrtBasePrice').value = o.basePrice || 0;
    document.getElementById('hrtDeposit').value = o.defaultDeposit || 0;
    document.getElementById('hrtCapacity').value = o.capacity || 2;
    document.getElementById('hrtDesc').value = o.description || '';
    document.getElementById('hotelRoomTypeModalOverlay').classList.remove('hidden')
  };

  window.Admin.saveHotelRoomType = async function () {
    var name = document.getElementById('hrtName').value.trim();
    var label = document.getElementById('hrtLabel').value.trim();
    if (!name) return toast('房型标识不能为空', 'error');
    if (!label) return toast('房型名称不能为空', 'error');
    var data = {
      name: name, label: label,
      basePrice: parseFloat(document.getElementById('hrtBasePrice').value) || 0,
      defaultDeposit: parseFloat(document.getElementById('hrtDeposit').value) || 0,
      capacity: parseInt(document.getElementById('hrtCapacity').value) || 2,
      description: document.getElementById('hrtDesc').value.trim()
    };
    var r;
    if (editingHotelRoomTypeId) {
      r = await api('/hotel-room-types/' + editingHotelRoomTypeId, 'PUT', data)
    } else {
      r = await api('/hotel-room-types', 'POST', data)
    }
    if (r.code === 200 || r.code === 201) { Admin.closeModal('hotelRoomTypeModalOverlay'); loadHotelRoomTypes(); toast(r.message || '保存成功', 'success') }
    else { toast(r.message, 'error') }
  };

  window.Admin.deleteHotelRoomType = async function (id) {
    if (!confirm('确定删除该客房房型？')) return;
    var r = await api('/hotel-room-types/' + id, 'DELETE');
    if (r.code === 200) { loadHotelRoomTypes(); toast('删除成功', 'success') }
    else { toast(r.message, 'error') }
  };

  // ===== 迁移住客房间 =====
  window.Admin.showTransferRoom = async function (orderId, guestName, currentRoom) {
    document.getElementById('tfOrderId').value = orderId;
    document.getElementById('tfGuestName').textContent = guestName;
    document.getElementById('tfCurrentRoom').textContent = currentRoom;
    var ordRes = await api('/orders/' + orderId);
    if (ordRes.code !== 200) return toast('获取订单详情失败', 'error');
    var order = ordRes.data;
    var rtRes = await api('/room-types');
    var ticketPackage = (rtRes.code === 200 && rtRes.data) ? rtRes.data.find(function (t) { return t.name === order.room_type }) : null;
    var requiredHotelRoomType = ticketPackage ? ticketPackage.hotelRoomType : null;
    var roomsRes = await api('/rooms');
    var sel = document.getElementById('tfTargetRoom');
    sel.innerHTML = '<option value="">请选择目标物理房间</option>';
    if (roomsRes.code === 200 && roomsRes.data) {
      roomsRes.data.forEach(function (rm) {
        var isSameType = !requiredHotelRoomType || rm.room_type === requiredHotelRoomType;
        var remainingCapacity = rm.capacity - rm.current_occupants;
        if (rm.room_number !== currentRoom && isSameType && remainingCapacity >= (order.guests || 1)) {
          var opt = document.createElement('option');
          opt.value = rm.id;
          opt.textContent = rm.room_number + ' (' + (RM[rm.room_type] || rm.room_type) + ') 剩余容量:' + remainingCapacity + '/' + rm.capacity + '人';
          sel.appendChild(opt);
        }
      })
    }
    document.getElementById('transferRoomModalOverlay').classList.remove('hidden');
  };

  window.Admin.confirmTransferRoom = async function () {
    var orderId = document.getElementById('tfOrderId').value;
    var targetRoomId = document.getElementById('tfTargetRoom').value;
    if (!targetRoomId) return toast('请选择目标物理房间', 'error');
    var r = await api('/orders/' + orderId, 'PUT', { room_id: parseInt(targetRoomId) });
    if (r.code === 200) { Admin.closeModal('transferRoomModalOverlay'); loadRooms(); loadOrders(); toast('迁移房间成功', 'success') }
    else { toast(r.message || '迁移失败', 'error') }
  };

  // ===== 管理端会话管理 =====
  var idleTimer = null, refreshTimer = null, sessionTimeoutMinutes = 480, lastActivity = 0;

  async function fetchSessionTimeout() {
    try {
      var r = await fetch(location.origin + '/api/settings/session-timeout');
      var d = await r.json();
      if (d.code === 200 && d.data) sessionTimeoutMinutes = d.data.timeout_minutes;
    } catch (e) { }
  }

  function resetIdleTimer() {
    var now = Date.now();
    if (now - lastActivity < 30000) return;
    lastActivity = now;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(showIdleWarning, sessionTimeoutMinutes * 60 * 1000);
  }

  function showIdleWarning() {
    if (confirm('您已长时间未操作，会话即将过期。点击"确定"继续使用。')) {
      lastActivity = 0; resetIdleTimer(); refreshAdminToken();
    } else {
      localStorage.removeItem('admin_token'); localStorage.removeItem('admin_user');
      location.href = 'admin-login.html';
    }
  }

  async function refreshAdminToken() {
    try {
      var r = await fetch(location.origin + '/api/auth/refresh', {
        method: 'POST', headers: { Authorization: 'Bearer ' + T }
      });
      var d = await r.json();
      if (d.code === 200 && d.data) { T = d.data.token; localStorage.setItem('admin_token', T) }
    } catch (e) { }
  }

  function startRefreshTimer() {
    clearInterval(refreshTimer);
    var interval = sessionTimeoutMinutes * 60 * 1000 * 0.75;
    refreshTimer = setInterval(function () { if (T) refreshAdminToken() }, interval);
  }

  // ===== STAFFS 押金管理 =====
  var allStaffDepositsData = [];
  var currentStaffDepositFilter = 'all';

  async function loadStaffDeposits() {
    loadStaffDepositChannelStatus();
    var r = await api('/staff-deposits');
    var tb = document.getElementById('staffDepositTableBody');
    if (!tb) return;
    if (r.code !== 200) { toast(r.message || '加载STAFF押金失败', 'error'); return; }
    allStaffDepositsData = r.data || [];
    renderFilteredStaffDeposits();
  }

  async function loadStaffDepositChannelStatus() {
    var r = await api('/settings');
    if (r.code === 200 && r.data) {
      var isOpen = (r.data.staff_deposit_open === undefined || r.data.staff_deposit_open === '1');
      var chk = document.getElementById('toggleStaffDeposit');
      var txt = document.getElementById('staffDepositStatusText');
      if (chk) chk.checked = isOpen;
      if (txt) {
        txt.textContent = isOpen ? '已开启 (可提交)' : '已关闭 (只读状态)';
        txt.style.color = isOpen ? '#15803d' : '#dc2626';
      }
    }
  }

  window.Admin.toggleStaffDepositChannel = async function (isOpen) {
    var txt = document.getElementById('staffDepositStatusText');
    if (txt) txt.textContent = '保存中...';

    var r = await api('/settings', 'PUT', { staff_deposit_open: isOpen ? '1' : '0' });
    if (r.code === 200) {
      toast('STAFF 押金入口已' + (isOpen ? '开启' : '关闭'), 'success');
      loadStaffDepositChannelStatus();
    } else {
      toast(r.message || '设置失败', 'error');
      loadStaffDepositChannelStatus();
    }
  };

  function renderFilteredStaffDeposits() {
    var tb = document.getElementById('staffDepositTableBody');
    if (!tb) return;
    var searchInput = document.getElementById('staffDepositSearchInput');
    var search = searchInput ? searchInput.value.trim().toLowerCase() : '';

    var list = allStaffDepositsData.filter(function (d) {
      if (currentStaffDepositFilter !== 'all' && d.status !== currentStaffDepositFilter) return false;
      if (search) {
        var s1 = (d.staff_nickname || '').toLowerCase();
        var s2 = (d.staff_username || '').toLowerCase();
        var s3 = (d.staff_phone || '').toLowerCase();
        return s1.includes(search) || s2.includes(search) || s3.includes(search);
      }
      return true;
    });

    if (list.length === 0) {
      tb.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#888;padding:24px;">暂无 STAFF 押金记录</td></tr>';
      return;
    }

    var stMap = { collected: '已收取', refunded: '已退还', forfeited: '已扣除' };
    var stBadge = { collected: 'badge-success', refunded: 'badge-info', forfeited: 'badge-danger' };

    tb.innerHTML = list.map(function (d) {
      var statusText = stMap[d.status] || d.status;
      var badgeClass = stBadge[d.status] || 'badge-secondary';
      var actions = '';
      if (d.status === 'collected') {
        actions = '<button class="btn btn-sm btn-primary" onclick="Admin.showStaffDepositModal(' + d.id + ')">处理/退押</button>';
      } else {
        actions = '<span style="color:#999;font-size:12px;">已归档</span>';
      }
      actions += ' <button class="btn btn-sm btn-danger" onclick="Admin.deleteStaffDeposit(' + d.id + ')">删除</button>';

      return '<tr>' +
        '<td>#' + d.id + '</td>' +
        '<td>' + esc(d.staff_username || '-') + '</td>' +
        '<td>' + esc(d.staff_nickname || d.staff_username || '-') + '</td>' +
        '<td>' + esc(d.staff_phone || '-') + '</td>' +
        '<td><strong>¥' + parseFloat(d.amount).toFixed(2) + '</strong></td>' +
        '<td><span class="badge ' + badgeClass + '">' + statusText + '</span></td>' +
        '<td>' + esc(d.paid_at || '-') + '</td>' +
        '<td>' + esc(d.resolved_at || '-') + '</td>' +
        '<td>' + esc(d.remark || '-') + '</td>' +
        '<td>' + actions + '</td>' +
        '</tr>';
    }).join('');
  }

  window.Admin.filterStaffDeposits = function (status) {
    currentStaffDepositFilter = status;
    var tabs = document.querySelectorAll('#staffDepositFilterTabs .filter-tab');
    tabs.forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-status') === status); });
    renderFilteredStaffDeposits();
  };

  window.Admin.showAddStaffDepositModal = async function () {
    document.getElementById('sdAmount').value = '200';
    document.getElementById('sdRemark').value = '';
    var userSel = document.getElementById('sdStaffId');
    userSel.innerHTML = '<option value="">加载中...</option>';

    var r = await api('/users');
    if (r.code === 200 && r.data) {
      var staffUsers = r.data.filter(function (u) { return u.role === 'staff' || u.role === 'admin'; });
      if (staffUsers.length === 0) {
        userSel.innerHTML = '<option value="">暂无 STAFF 角色账号</option>';
      } else {
        userSel.innerHTML = '<option value="">请选择 STAFF 账号</option>' + staffUsers.map(function (u) {
          return '<option value="' + u.id + '">' + esc(u.nickname || u.username) + ' (@' + esc(u.username) + ' - ' + esc(u.phone || '无手机号') + ')</option>';
        }).join('');
      }
    } else {
      userSel.innerHTML = '<option value="">获取用户失败</option>';
    }

    document.getElementById('addStaffDepositModalOverlay').classList.remove('hidden');
  };

  window.Admin.createStaffDeposit = async function () {
    var userId = document.getElementById('sdStaffId').value;
    var amount = parseFloat(document.getElementById('sdAmount').value) || 0;
    var remark = document.getElementById('sdRemark').value.trim();

    if (!userId) return toast('请选择 STAFF 账号', 'error');
    if (amount <= 0) return toast('押金金额必须大于 0', 'error');

    var r = await api('/staff-deposits', 'POST', { user_id: parseInt(userId), amount: amount, remark: remark });
    if (r.code === 201 || r.code === 200) {
      Admin.closeModal('addStaffDepositModalOverlay');
      loadStaffDeposits();
      toast('STAFF 押金收取成功', 'success');
    } else {
      toast(r.message || '录入失败', 'error');
    }
  };

  var activeStaffDepositId = null;
  window.Admin.showStaffDepositModal = async function (id) {
    activeStaffDepositId = id;
    var r = await api('/staff-deposits/' + id);
    if (r.code !== 200) return toast('获取押金详情失败', 'error');
    var d = r.data;
    document.getElementById('sdOpInfo').textContent = '#' + d.id + ' STAFF: ' + (d.staff_nickname || d.staff_username) + ' | 金额: ¥' + parseFloat(d.amount).toFixed(2);
    document.getElementById('sdOpRemark').value = '';
    document.getElementById('staffDepositModalOverlay').classList.remove('hidden');
  };

  window.Admin.refundStaffDeposit = async function () {
    if (!activeStaffDepositId) return;
    var remark = document.getElementById('sdOpRemark').value.trim();
    var r = await api('/staff-deposits/' + activeStaffDepositId + '/refund', 'PUT', { remark: remark });
    if (r.code === 200) {
      Admin.closeModal('staffDepositModalOverlay');
      loadStaffDeposits();
      toast('押金已退还', 'success');
    } else {
      toast(r.message || '退还失败', 'error');
    }
  };

  window.Admin.forfeitStaffDeposit = async function () {
    if (!activeStaffDepositId) return;
    var remark = document.getElementById('sdOpRemark').value.trim();
    if (!remark) return toast('扣除押金必须输入原因备注', 'error');
    var r = await api('/staff-deposits/' + activeStaffDepositId + '/forfeit', 'PUT', { remark: remark });
    if (r.code === 200) {
      Admin.closeModal('staffDepositModalOverlay');
      loadStaffDeposits();
      toast('押金已扣除', 'success');
    } else {
      toast(r.message || '扣除失败', 'error');
    }
  };

  window.Admin.deleteStaffDeposit = async function (id) {
    if (!confirm('确定要删除该 STAFF 押金记录吗？')) return;
    var r = await api('/staff-deposits/' + id, 'DELETE');
    if (r.code === 200) {
      loadStaffDeposits();
      toast('记录已删除', 'success');
    } else {
      toast(r.message || '删除失败', 'error');
    }
  };

  function initSessionManagement() {
    fetchSessionTimeout().then(function () {
      resetIdleTimer(); startRefreshTimer();
    });
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function (e) {
      document.addEventListener(e, resetIdleTimer, { passive: true });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
