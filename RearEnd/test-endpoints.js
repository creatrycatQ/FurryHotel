require('dotenv').config();
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config');

async function testAPI() {
  // 生成token
  const token = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, JWT_SECRET);

  console.log('测试 API 端点...\n');

  // 测试1: 获取所有room types
  try {
    const res = await fetch('http://localhost:3000/api/admin/room-types', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    console.log('✓ GET /api/admin/room-types:', data.code === 200 ? 'SUCCESS' : 'FAILED');
    if (data.code === 200) {
      console.log('  返回数据:', data.data.length, '条记录');
      console.log('  第一条:', data.data[0]);
    }
  } catch (err) {
    console.log('✗ GET /api/admin/room-types: ERROR', err.message);
  }

  // 测试2: 获取单个room type (ID=24)
  try {
    const res = await fetch('http://localhost:3000/api/admin/room-types/24', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    console.log('\n✓ GET /api/admin/room-types/24:', data.code === 200 ? 'SUCCESS' : 'FAILED');
    if (data.code === 200) {
      console.log('  数据:', data.data);
    } else {
      console.log('  错误:', data.message);
    }
  } catch (err) {
    console.log('\n✗ GET /api/admin/room-types/24: ERROR', err.message);
  }



  console.log('\n测试完成！');
}

testAPI().catch(console.error);
