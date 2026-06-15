(function(){var A=(location.origin||'http://localhost:3000')+'/api/admin',T='',E=null,G=null,O=null;
var RM={};
var editingRoomId=null,editingGuestId=null,editingOrderId=null;
var RS={available:'可入住',occupied:'已入住',cleaning:'清洁中',maintenance:'维护中',reserved:'已预定'};
var GS={checked_in:'已入住',checked_out:'已退房'};
var OS={pending:'待确认',confirmed:'已确认',cancelled:'已取消',completed:'已完成',checked_in:'已入住'};

// HTML 转义，防止 XSS
function esc(s){if(s==null)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

async function init(){
 T=localStorage.getItem('admin_token');
 if(!T){location.href='admin-login.html';return}
 try{
  var r=await fetch((location.origin||'http://localhost:3000')+'/api/auth/me',{headers:{Authorization:'Bearer '+T}});
  var d=await r.json();
  if(d.code!==200){location.href='admin-login.html';return}
  document.getElementById('sidebarUser').textContent=d.data.nickname||d.data.username;
  switchView('dashboard');
  setupNav();setupToggle();
 }catch(e){location.href='admin-login.html'}
}

async function api(url,m,b){
 var o={method:m||'GET',headers:{Authorization:'Bearer '+T}};
 if(b){o.headers['Content-Type']='application/json';o.body=JSON.stringify(b)}
 var r=await fetch(A+url,o);return r.json()
}

function toast(msg,tp){
 tp=tp||'info';var old=document.querySelector('.toast');if(old)old.remove();
 var el=document.createElement('div');el.className='toast toast-'+tp;el.textContent=msg;
 document.body.appendChild(el);
 requestAnimationFrame(function(){el.classList.add('show')});
 setTimeout(function(){el.classList.remove('show');setTimeout(function(){el.remove()},300)},2500)
}

function setupToggle(){
 document.getElementById('sidebarToggle').addEventListener('click',function(){
  var s=document.getElementById('sidebar'),m=document.getElementById('mainContent');
  var c=s.classList.toggle('collapsed');m.classList.toggle('expanded');
  localStorage.setItem('sidebarCollapsed',c?'1':'0')
 });
 if(localStorage.getItem('sidebarCollapsed')==='1'){
  document.getElementById('sidebar').classList.add('collapsed');
  document.getElementById('mainContent').classList.add('expanded')
 }
}

function setupNav(){
 document.querySelectorAll('.nav-item:not(.nav-parent)').forEach(function(item){
  item.addEventListener('click',function(){
   document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active')});
   document.querySelectorAll('.nav-sub-item').forEach(function(n){n.classList.remove('active')});
   this.classList.add('active');
   switchView(this.dataset.tab)
  })
 });
 document.querySelectorAll('.nav-parent').forEach(function(parent){
  parent.addEventListener('click',function(){
   var group=this.closest('.nav-group');
   group.classList.toggle('open')
  })
 });
 document.querySelectorAll('.nav-sub-item').forEach(function(item){
  item.addEventListener('click',function(){
   document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active')});
   document.querySelectorAll('.nav-sub-item').forEach(function(n){n.classList.remove('active')});
   this.classList.add('active');
   switchView(this.dataset.tab)
  })
 })
}

function switchView(view){
 document.querySelectorAll('.tab-content').forEach(function(v){v.classList.add('hidden')});
 var el=document.getElementById('tab-'+view);
 if(el)el.classList.remove('hidden');
 if(view==='dashboard')loadDashboard();
 else if(view==='rooms')loadRooms();
 else if(view==='roomTypes')loadRoomTypes();
 else if(view==='guests')loadGuests();
 else if(view==='orders')loadOrders();
 else if(view==='users')loadUsers();
}

// ===== 仪表盘 =====
async function loadDashboard(){
 var r=await api('/dashboard');
 if(r.code!==200)return;
 var d=r.data;
 document.getElementById('statRooms').textContent=d.availableRooms+' / '+d.totalRooms;
 document.getElementById('statGuests').textContent=d.totalGuests;
 document.getElementById('statOrders').textContent=d.totalOrders;
 document.getElementById('statTodayCheckIn').textContent=d.todayCheckIn;
 document.getElementById('statRevenue').textContent='\u00a5'+(d.todayRevenue||0)
}

// ===== 房间管理 =====
async function ensureRoomTypes(){
 if(Object.keys(RM).length===0){
  var rt=await api('/room-types');
  if(rt.code===200&&rt.data){rt.data.forEach(function(t){RM[t.name]=t.label})}
 }
}

async function loadRooms(){
 await ensureRoomTypes();
 var r=await api('/rooms');
 var tb=document.getElementById('roomTableBody');
 if(r.code!==200)return;
 tb.innerHTML=r.data.map(function(o){return '<tr>'+
  '<td>'+esc(o.id)+'</td><td>'+esc(o.room_number)+'</td><td>'+esc(RM[o.room_type])+'</td><td>'+esc(o.floor)+'</td>'+
  '<td>\u00a5'+esc(o.price)+'</td>'+
  '<td><span class="status-tag status-'+esc(o.status)+'">'+esc(RS[o.status])+'</span></td>'+
  '<td>'+esc(o.description)+'</td>'+
  '<td>'+
   '<button class="btn btn-sm btn-primary" onclick="Admin.editRoom('+o.id+')">\u7f16\u8f91</button> '+
   (o.status!=='available'?'<button class="btn btn-sm btn-warning" onclick="Admin.checkoutRoom('+o.id+')">\u9000\u623f</button> ':'')+
   '<button class="btn btn-sm btn-danger" onclick="Admin.deleteRoom('+o.id+')">\u5220\u9664</button>'+
  '</td></tr>'
 }).join('')
}

async function loadRoomTypeOptions(selectedValue){
 var r=await api('/room-types');
 var sel=document.getElementById('rmType');
 sel.innerHTML='<option value="">\u8bf7\u9009\u62e9\u7c7b\u578b</option>';
 if(r.code===200&&r.data){
  RM={};
  r.data.forEach(function(t){
   RM[t.name]=t.label;
   var opt=document.createElement('option');
   opt.value=t.name;opt.textContent=t.label;
   sel.appendChild(opt);
  });
 }
 if(selectedValue)sel.value=selectedValue;
}

async function showRoomModal(){
 editingRoomId=null;
 document.getElementById('roomModalTitle').textContent='\u6dfb\u52a0\u623f\u95f4';
 document.getElementById('rmNumber').value='';
 document.getElementById('rmFloor').value=1;document.getElementById('rmPrice').value=288;
 document.getElementById('rmStatus').value='available';document.getElementById('rmDesc').value='';
 await loadRoomTypeOptions('');
 document.getElementById('roomModalOverlay').classList.remove('hidden');
}
function closeRoomModal(){document.getElementById('roomModalOverlay').classList.add('hidden')}

window.Admin={};
window.Admin.editRoom=async function(id){
 editingRoomId=id;
 var r=await api('/rooms/'+id);
 if(r.code!==200)return;
 var o=r.data;
 document.getElementById('roomModalTitle').textContent='\u7f16\u8f91\u623f\u95f4';
 document.getElementById('rmNumber').value=o.room_number;
 await loadRoomTypeOptions(o.room_type);
 document.getElementById('rmFloor').value=o.floor;document.getElementById('rmPrice').value=o.price;
 document.getElementById('rmStatus').value=o.status;document.getElementById('rmDesc').value=o.description||'';
 document.getElementById('roomModalOverlay').classList.remove('hidden')
};

window.Admin.saveRoom=async function(){
 var data={room_number:document.getElementById('rmNumber').value.trim(),room_type:document.getElementById('rmType').value,
  floor:parseInt(document.getElementById('rmFloor').value)||1,price:parseFloat(document.getElementById('rmPrice').value)||0,
  status:document.getElementById('rmStatus').value,description:document.getElementById('rmDesc').value.trim()};
 if(!data.room_number)return toast('\u623f\u95f4\u53f7\u4e0d\u80fd\u4e3a\u7a7a','error');
 var r;
 if(editingRoomId){r=await api('/rooms/'+editingRoomId,'PUT',data)}
 else{r=await api('/rooms','POST',data)}
 if(r.code===200||r.code===201){closeRoomModal();loadRooms();toast(r.message||'\u4fdd\u5b58\u6210\u529f','success')}
 else{toast(r.message,'error')}
};

window.Admin.deleteRoom=async function(id){
 if(!confirm('\u786e\u5b9a\u5220\u9664\u8be5\u623f\u95f4\uff1f'))return;
 var r=await api('/rooms/'+id,'DELETE');
 if(r.code===200){loadRooms();toast('\u5220\u9664\u6210\u529f','success')}
 else{toast(r.message,'error')}
};

window.Admin.checkoutRoom=async function(id){
 if(!confirm('\u786e\u5b9a\u9000\u623f\uff1f\u623f\u95f4\u5c06\u91cd\u7f6e\u4e3a\u53ef\u5165\u4f4f\u72b6\u6001'))return;
 var r=await api('/rooms/'+id,'PUT',{status:'available'});
 if(r.code===200){loadRooms();toast('\u9000\u623f\u6210\u529f','success')}
 else{toast(r.message,'error')}
};

// ===== 房间类型管理 =====
async function loadRoomTypes(){
 var r=await api('/room-types');
 var tb=document.getElementById('roomTypeTableBody');
 if(r.code!==200){tb.innerHTML='<tr><td colspan="4">加载失败</td></tr>';return}
 var list=r.data||[];
 tb.innerHTML=list.map(function(t){
  return '<tr><td>'+esc(t.name)+'</td><td>¥'+esc(t.basePrice)+'</td><td>'+esc(t.description||'-')+'</td><td>'+
   '<button class="btn btn-sm" onclick="editRoomType('+t.id+')">编辑</button> '+
   '<button class="btn btn-sm btn-danger" onclick="deleteRoomType('+t.id+')">删除</button></td></tr>'
 }).join('')
}

var editingRoomTypeId=null;
window.showRoomTypeModal=function(){
 editingRoomTypeId=null;
 document.getElementById('roomTypeModalTitle').textContent='添加房间类型';
 document.getElementById('rtLabel').value='';document.getElementById('rtBasePrice').value='0';document.getElementById('rtDesc').value='';
 document.getElementById('roomTypeModalOverlay').classList.remove('hidden')
};
window.editRoomType=async function(id){
 editingRoomTypeId=id;
 var r=await api('/room-types/'+id);
 if(r.code!==200)return toast(r.message||'获取失败','error');
 var o=r.data;
 document.getElementById('roomTypeModalTitle').textContent='编辑房间类型';
 document.getElementById('rtLabel').value=o.label||o.name||'';document.getElementById('rtBasePrice').value=o.basePrice||0;document.getElementById('rtDesc').value=o.description||'';
 document.getElementById('roomTypeModalOverlay').classList.remove('hidden')
};
window.Admin.saveRoomType=async function(){
 var label=document.getElementById('rtLabel').value.trim();
 if(!label)return toast('类型名称不能为空','error');
 var data={name:label,label:label,
  basePrice:parseFloat(document.getElementById('rtBasePrice').value)||0,
  description:document.getElementById('rtDesc').value.trim()};
 var r;
 if(editingRoomTypeId){r=await api('/room-types/'+editingRoomTypeId,'PUT',data)}
 else{r=await api('/room-types','POST',data)}
 if(r.code===200||r.code===201){Admin.closeModal('roomTypeModalOverlay');loadRoomTypes();toast(r.message||'保存成功','success')}
 else{toast(r.message,'error')}
};
window.deleteRoomType=async function(id){
 if(!confirm('确定删除该房间类型？'))return;
 var r=await api('/room-types/'+id,'DELETE');
 if(r.code===200){loadRoomTypes();toast('删除成功','success')}
 else{toast(r.message,'error')}
};

// ===== 客人管理 =====
async function loadGuests(){
 var r=await api('/guests');
 var tb=document.getElementById('guestTableBody');
 if(r.code!==200)return;
 tb.innerHTML=r.data.map(function(o){return '<tr>'+
  '<td>'+esc(o.id)+'</td><td>'+esc(o.name)+'</td><td>'+esc(o.phone)+'</td><td>'+esc(o.id_card)+'</td>'+
  '<td>'+esc(o.username?(o.user_nickname||o.username):'-')+'</td>'+
  '<td>'+esc(o.room_number||'-')+'</td><td>'+esc(o.check_in||'-')+'</td><td>'+esc(o.check_out||'-')+'</td>'+
  '<td><span class="status-tag status-'+esc(o.status)+'">'+esc(GS[o.status])+'</span></td>'+
  '<td><button class="btn btn-sm btn-primary" onclick="Admin.editGuest('+o.id+')">编辑</button> '+
   '<button class="btn btn-sm btn-danger" onclick="Admin.deleteGuest('+o.id+')">删除</button></td>'+
  '</tr>'
 }).join('')
}

function showGuestModal(){
 editingGuestId=null;
 document.getElementById('guestModalTitle').textContent='\u6dfb\u52a0\u5ba2\u4eba';
 document.getElementById('gmName').value='';document.getElementById('gmPhone').value='';
 document.getElementById('gmIdCard').value='';document.getElementById('gmCheckIn').value='';
 loadRoomSelect();document.getElementById('guestModalOverlay').classList.remove('hidden')
}
function closeGuestModal(){document.getElementById('guestModalOverlay').classList.add('hidden')}

window.Admin.editGuest=async function(id){
 editingGuestId=id;
 var r=await api('/guests/'+id);
 if(r.code!==200)return;
 var o=r.data;
 document.getElementById('guestModalTitle').textContent='\u7f16\u8f91\u5ba2\u4eba';
 document.getElementById('gmName').value=o.name;document.getElementById('gmPhone').value=o.phone||'';
 document.getElementById('gmIdCard').value=o.id_card||'';document.getElementById('gmCheckIn').value=o.check_in||'';
 loadRoomSelect();
 setTimeout(function(){document.getElementById('gmRoomId').value=o.room_id||''},200);
 document.getElementById('guestModalOverlay').classList.remove('hidden')
};

window.Admin.saveGuest=async function(){
 var data={name:document.getElementById('gmName').value.trim(),phone:document.getElementById('gmPhone').value.trim(),
  id_card:document.getElementById('gmIdCard').value.trim(),
  room_id:document.getElementById('gmRoomId').value?parseInt(document.getElementById('gmRoomId').value):null,
  check_in:document.getElementById('gmCheckIn').value};
 if(!data.name)return toast('\u59d3\u540d\u4e0d\u80fd\u4e3a\u7a7a','error');
 var r;
 if(editingGuestId){r=await api('/guests/'+editingGuestId,'PUT',data)}
 else{r=await api('/guests','POST',data)}
 if(r.code===200||r.code===201){closeGuestModal();loadGuests();toast(r.message||'\u4fdd\u5b58\u6210\u529f','success')}
 else{toast(r.message,'error')}
};

window.Admin.deleteGuest=async function(id){
 if(!confirm('确定要删除该客人吗？'))return;
 var r=await api('/guests/'+id,'DELETE');
 if(r.code===200){loadGuests();toast('删除成功','success')}
 else{toast(r.message,'error')}
};

// ===== 订单管理 =====
async function loadOrders(){
 var r=await api('/orders');
 var tb=document.getElementById('orderTableBody');
 if(r.code!==200)return;
 tb.innerHTML=r.data.map(function(o){return '<tr>'+
  '<td>'+esc(o.id)+'</td><td>'+esc(o.guest_name)+'</td><td>'+esc(o.guest_phone||'-')+'</td>'+
  '<td>'+esc(o.room_number||'-')+'</td><td>'+esc(o.check_in_date)+'</td><td>'+esc(o.check_out_date)+'</td>'+
  '<td>\u00a5'+esc(o.total_price)+'</td>'+
  '<td><span class="status-tag status-'+esc(o.status)+'">'+esc(OS[o.status])+'</span></td>'+
  '<td>'+
   (o.status==='pending'?'<button class="btn btn-sm btn-success" onclick="Admin.verifyOrder('+o.id+')">\u6838\u9a8c</button> ':'')+
   '<button class="btn btn-sm btn-primary" onclick="Admin.editOrder('+o.id+')">\u7f16\u8f91</button> '+
   '<button class="btn btn-sm btn-danger" onclick="Admin.deleteOrder('+o.id+')">\u5220\u9664</button>'+
  '</td></tr>'
 }).join('')
}

async function loadRoomSelect(){
 await ensureRoomTypes();
 var r=await api('/rooms');
 if(r.code!==200)return;
 var sel=document.getElementById('gmRoomId');
 sel.innerHTML='<option value="">\u672a\u5206\u914d</option>'+r.data.map(function(o){
  return '<option value="'+o.id+'">'+o.room_number+' ('+RM[o.room_type]+')</option>'
 }).join('')
}
async function loadOrderRoomSelect(){
 await ensureRoomTypes();
 var r=await api('/rooms');
 if(r.code!==200)return;
 var sel=document.getElementById('omRoomId');
 sel.innerHTML='<option value="">\u8bf7\u9009\u62e9</option>'+r.data.map(function(o){
  return '<option value="'+o.id+'">'+o.room_number+' ('+RM[o.room_type]+') \u00a5'+o.price+'</option>'
 }).join('')
}

function showOrderModal(){
 editingOrderId=null;
 document.getElementById('orderModalTitle').textContent='\u65b0\u5efa\u8ba2\u5355';
 document.getElementById('omGuestName').value='';document.getElementById('omGuestPhone').value='';
 document.getElementById('omCheckIn').value=new Date().toISOString().split('T')[0];
 document.getElementById('omCheckOut').value='';document.getElementById('omPrice').value='0';
 document.getElementById('omRemark').value='';
 loadOrderRoomSelect();document.getElementById('orderModalOverlay').classList.remove('hidden')
}
function closeOrderModal(){document.getElementById('orderModalOverlay').classList.add('hidden')}

window.Admin.deleteOrder=async function(id){
 if(!confirm('\u786e\u5b9a\u5220\u9664\u8be5\u8ba2\u5355\uff1f'))return;
 var r=await api('/orders/'+id,'DELETE');
 if(r.code===200){loadOrders();toast('\u5220\u9664\u6210\u529f','success')}
 else{toast(r.message||'\u5220\u9664\u5931\u8d25','error')}
};

window.Admin.editOrder=async function(id){
 editingOrderId=id;
 var r=await api('/orders/'+id);
 if(r.code!==200)return;
 var o=r.data;
 document.getElementById('orderModalTitle').textContent='\u7f16\u8f91\u8ba2\u5355';
 document.getElementById('omGuestName').value=o.guest_name;
 document.getElementById('omGuestPhone').value=o.guest_phone||'';
 document.getElementById('omCheckIn').value=o.check_in_date;
 document.getElementById('omCheckOut').value=o.check_out_date;
 document.getElementById('omPrice').value=o.total_price;
 document.getElementById('omRemark').value=o.remark||'';
 loadOrderRoomSelect();
 setTimeout(function(){document.getElementById('omRoomId').value=o.room_id||''},200);
 document.getElementById('orderModalOverlay').classList.remove('hidden')
};

window.Admin.saveOrder=async function(){
 var data={guest_name:document.getElementById('omGuestName').value.trim(),
  guest_phone:document.getElementById('omGuestPhone').value.trim(),
  room_id:document.getElementById('omRoomId').value?parseInt(document.getElementById('omRoomId').value):null,
  check_in_date:document.getElementById('omCheckIn').value,
  check_out_date:document.getElementById('omCheckOut').value,
  total_price:parseFloat(document.getElementById('omPrice').value)||0,
  remark:document.getElementById('omRemark').value.trim()};
 if(!data.guest_name)return toast('\u5ba2\u4eba\u59d3\u540d\u4e0d\u80fd\u4e3a\u7a7a','error');
 if(!data.check_in_date||!data.check_out_date)return toast('\u65e5\u671f\u4e0d\u80fd\u4e3a\u7a7a','error');
 var r;
 if(editingOrderId){r=await api('/orders/'+editingOrderId,'PUT',data)}
 else{r=await api('/orders','POST',data)}
 if(r.code===200||r.code===201){closeOrderModal();loadOrders();toast(r.message||'\u4fdd\u5b58\u6210\u529f','success')}
 else{toast(r.message,'error')}
};

// ===== 在线核验 =====
var html5QrCode = null;
var scannerActive = false;

window.switchVerifyMode = function(mode) {
  document.querySelectorAll('.verify-tab').forEach(function(t) { t.classList.remove('active'); });
  if (mode === 'scan') {
    document.querySelector('.verify-tab').classList.add('active');
    document.getElementById('verifyScanArea').classList.remove('hidden');
    document.getElementById('verifyManualArea').classList.add('hidden');
  } else {
    document.querySelectorAll('.verify-tab')[1].classList.add('active');
    document.getElementById('verifyScanArea').classList.add('hidden');
    document.getElementById('verifyManualArea').classList.remove('hidden');
    stopScanner();
  }
};

window.startScannerManual = function() {
  startScanner();
};

function startScanner() {
  if (scannerActive) return;
  var el = document.getElementById('qrReader');
  el.innerHTML = '';
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode('qrReader');
  }
  var config = { fps: 10, qrbox: { width: 250, height: 150 }, formatsToSupport: [
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
  ]};
  html5QrCode.start(
    { facingMode: 'environment' },
    config,
    function(decodedText) {
      scannerActive = false;
      html5QrCode.stop().then(function() {
        document.getElementById('btnStopScan').style.display = 'none';
        document.getElementById('btnStartScan').style.display = 'inline-block';
        document.getElementById('verifyOrderId').value = decodedText;
        document.getElementById('verifyResult').innerHTML =
          '<div class="scan-result">📷 识别结果:  <strong>' + decodedText + '</strong></div>';
        doVerifyFromInput();
      }).catch(function() {});
    },
    function() {}
  ).then(function() {
    scannerActive = true;
    document.getElementById('btnStartScan').style.display = 'none';
    document.getElementById('btnStopScan').style.display = 'inline-block';
  }).catch(function(err) {
    document.getElementById('qrReader').innerHTML =
      '<div class="scan-error">❌ 无法启动摄像头<br><small>' + esc(err.message || err) + '</small><br><p>请切换到"手动输入"模式或允许摄像头权限</p></div>';
  });
}

window.stopScanner = function() {
  if (html5QrCode && scannerActive) {
    html5QrCode.stop().then(function() {
      scannerActive = false;
      document.getElementById('btnStopScan').style.display = 'none';
      document.getElementById('btnStartScan').style.display = 'inline-block';
    }).catch(function() {});
  }
};

window.doVerifyFromInput = function() {
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
      '<p>客人: ' + o.guest_name + ' | 房间: ' + (o.room_number || '-') + '</p>' +
      '<p>入住: ' + o.check_in_date + ' ~ ' + o.check_out_date + ' | 金额: \u00a5' + o.total_price + '</p>' +
      '<p>状态:  <span class="status-tag status-' + o.status + '">' + OS[o.status] + '</span></p>' +
    '</div>' +
    (o.status === 'confirmed' || o.status === 'completed'
      ? '<div class="verify-done">\u2713 该订单已核验</div>'
      : '<button class="btn btn-success" onclick="Admin.verifyOrder(' + o.id + ')" style="margin-top:12px">确认核验</button>');
}

window.Admin.verifyOrder = async function(id) {
  var note = prompt('核验备注（可选）：');
  if (note === null) return;
  var r = await api('/verify', 'POST', { order_id: id, result: 'success', note: note || '' });
  if (r.code === 200) { loadOrders(); toast('核验成功', 'success'); doVerifyById(id); }
  else { toast(r.message, 'error'); }
};

window.Admin.doVerify = function() {
  doVerifyFromInput();
};

window.Admin.closeModal=function(id){document.getElementById(id).classList.add('hidden')};

document.getElementById('logoutBtn').addEventListener('click',function(){
 if(confirm('\u786e\u5b9a\u8981\u9000\u51fa\u767b\u5f55\u5417\uff1f')){
  localStorage.removeItem('admin_token');localStorage.removeItem('admin_user');location.href='admin-login.html'
 }
});

window.showRoomModal=showRoomModal;window.closeRoomModal=closeRoomModal;
window.showGuestModal=showGuestModal;window.closeGuestModal=closeGuestModal;
window.showOrderModal=showOrderModal;window.closeOrderModal=closeOrderModal;

// ===== 账号管理 =====
async function loadUsers(){
 var r=await api('/users');
 var tb=document.getElementById('userTableBody');
 if(r.code!==200)return;
 var roleMap={admin:'管理员',guest:'普通用户'};
 tb.innerHTML=r.data.map(function(u){return '<tr>'+
  '<td>'+esc(u.id)+'</td><td>'+esc(u.username)+'</td><td>'+esc(u.nickname)+'</td><td>'+esc(u.phone||'-')+'</td>'+
  '<td>'+esc(roleMap[u.role])+'</td><td>'+esc(u.created_at)+'</td>'+
  '<td><button class="btn btn-sm btn-primary" onclick="Admin.showPasswordModal('+u.id+',this)\" data-username=\"'+esc(u.username)+'\">修改密码</button> '+
   '<button class="btn btn-sm btn-danger" onclick="Admin.deleteUser('+u.id+',this)" data-username="'+esc(u.username)+'">删除</button></td>'+
  '</tr>'}).join('')
}

window.Admin.showPasswordModal=function(id,btn){
 var username=btn?btn.getAttribute('data-username'):'';
 document.getElementById('pwUserId').value=id;
 document.getElementById('pwUsername').textContent=username;
 document.getElementById('pwNew').value='';
 document.getElementById('pwConfirm').value='';
 document.getElementById('passwordModalOverlay').classList.remove('hidden')
};

window.Admin.changePassword=async function(){
 var id=document.getElementById('pwUserId').value;
 var pw=document.getElementById('pwNew').value;
 var cf=document.getElementById('pwConfirm').value;
 if(!pw||pw.length<6)return toast('密码至少6位','error');
 if(pw!==cf)return toast('两次密码不一致','error');
 var r=await api('/users/'+id+'/password','PUT',{password:pw});
 if(r.code===200){Admin.closeModal('passwordModalOverlay');toast('密码修改成功','success')}
 else{toast(r.message,'error')}
};

window.showAddUserModal=function(){
 document.getElementById('auUsername').value='';
 document.getElementById('auPassword').value='';
 document.getElementById('auNickname').value='';
 document.getElementById('auPhone').value='';
 document.getElementById('auRole').value='guest';
 document.getElementById('addUserModalOverlay').classList.remove('hidden')
};

window.Admin.createUser=async function(){
 var data={
  username:document.getElementById('auUsername').value.trim(),
  password:document.getElementById('auPassword').value,
  nickname:document.getElementById('auNickname').value.trim(),
  phone:document.getElementById('auPhone').value.trim(),
  role:document.getElementById('auRole').value
 };
 if(!data.username||!data.password)return toast('用户名和密码不能为空','error');
 if(!/^[a-zA-Z0-9_]{3,20}$/.test(data.username))return toast('用户名需3-20位字母数字或下划线','error');
 if(data.password.length<6)return toast('密码至少6位','error');
 var r=await api('/users','POST',data);
 if(r.code===201){Admin.closeModal('addUserModalOverlay');loadUsers();toast('创建成功','success')}
 else{toast(r.message,'error')}
};

window.Admin.deleteUser=async function(id,btn){
 var username=btn?btn.getAttribute('data-username'):'该用户';
 if(!confirm('确定要删除用户 "'+username+'" 吗？此操作不可恢复！'))return;
 var r=await api('/users/'+id,'DELETE');
 if(r.code===200){loadUsers();toast('删除成功','success')}
 else{toast(r.message,'error')}
};

document.addEventListener('DOMContentLoaded',init);
})();
