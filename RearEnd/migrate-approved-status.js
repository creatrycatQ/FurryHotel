/**
 * 数据迁移脚本：将未核验的 confirmed 订单迁移为 approved
 *
 * 逻辑：
 * - 有核验记录（verifications 表）的 confirmed 订单保持不变（真正核验过的）
 * - 无核验记录的 confirmed 订单改为 approved（仅审核通过，未实际核验）
 *
 * 用法：node migrate-approved-status.js
 */

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'furry_hotel.db');
const db = new Database(dbPath);

// 启用 WAL 模式
db.pragma('journal_mode = WAL');

console.log('🔄 开始迁移：将未核验的 confirmed 订单状态更新为 approved ...\n');

// 查找需要迁移的订单：状态为 confirmed 且没有成功核验记录
const ordersToMigrate = db.prepare(`
  SELECT o.id, o.guest_name, o.room_id, o.status
  FROM orders o
  WHERE o.status = 'confirmed'
  AND o.id NOT IN (SELECT order_id FROM verifications WHERE result = 'success')
`).all();

console.log(`📋 发现 ${ordersToMigrate.length} 条需要迁移的订单：`);
if (ordersToMigrate.length > 0) {
  console.table(ordersToMigrate.map(o => ({ ID: o.id, 客人: o.guest_name, 房间ID: o.room_id })));
}

// 执行迁移
const migrate = db.transaction(() => {
  const stmt = db.prepare(`
    UPDATE orders SET status = 'approved', updated_at = datetime('now','localtime')
    WHERE status = 'confirmed'
    AND id NOT IN (SELECT order_id FROM verifications WHERE result = 'success')
  `);
  const result = stmt.run();
  return result.changes;
});

const changedCount = migrate();

console.log(`\n✅ 迁移完成：${changedCount} 条订单已从 confirmed 更新为 approved`);

// 验证结果
const remaining = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'confirmed'`).get();
const approved = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'approved'`).get();
console.log(`\n📊 当前状态分布：`);
console.log(`   - confirmed（已核验）: ${remaining.count} 条`);
console.log(`   - approved（已通过）: ${approved.count} 条`);

db.close();
