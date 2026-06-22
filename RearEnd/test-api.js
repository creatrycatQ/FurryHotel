// 测试API端点
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config');

// 生成管理员token
const token = jwt.sign({ id: 1, username: 'admin' }, JWT_SECRET || 'fallback-secret-key');

console.log('Generated token:', token);
console.log('\n测试命令：');
console.log(`curl -s http://localhost:3000/api/admin/room-types -H "Authorization: Bearer ${token}"`);
console.log(`\ncurl -s http://localhost:3000/api/admin/room-types/24 -H "Authorization: Bearer ${token}"`);
