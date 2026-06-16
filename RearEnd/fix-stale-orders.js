/**
 * 一次性修复脚本：清理已退房间的残留订单
 * 将 status='available' 的房间关联的活跃订单标记为 completed，并退还押金
 */

const { db, updateOrder, getDepositByOrderId, refundDeposit } = require('./database');

try {
  const staleOrders = db.prepare(`
    SELECT o.id, o.room_id, o.status as order_status, r.room_number
    FROM orders o
    JOIN rooms r ON o.room_id = r.id
    WHERE r.status = 'available' AND o.status IN ('confirmed', 'checked_in', 'pending')
  `).all();

  if (!staleOrders.length) {
    console.log('✅ 没有需要修复的残留订单');
    process.exit(0);
  }

  console.log(`🔍 发现 ${staleOrders.length} 条残留订单：`);
  console.table(staleOrders);

  let fixedCount = 0;
  let depositRefunded = 0;

  // 使用事务确保原子性
  const fixAll = db.transaction(() => {
    for (const order of staleOrders) {
      console.log(`\n修复订单 #${order.id}（房间 ${order.room_number}，当前状态: ${order.order_status}）`);

      updateOrder(order.id, { status: 'completed' });
      fixedCount++;

      const deposit = getDepositByOrderId(order.id);
      if (deposit && deposit.status === 'collected') {
        refundDeposit(deposit.id, null, '数据修复：退房时未同步完成');
        console.log(`  💰 押金 #${deposit.id}（￥${deposit.amount}）已退还`);
        depositRefunded++;
      }
    }
  });

  fixAll();

  console.log('\n========================================');
  console.log(`✅ 修复完成：${fixedCount} 条订单已完成，${depositRefunded} 笔押金已退还`);
  console.log('========================================');
} catch (err) {
  console.error('❌ 修复脚本执行失败:', err.message);
  process.exit(1);
}
