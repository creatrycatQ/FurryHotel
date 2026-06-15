const db = require('./database').db;

// Check all orders
const orders = db.prepare('SELECT id, guest_name, room_id, status FROM orders').all();
console.log('Orders:', JSON.stringify(orders, null, 2));

// Check all rooms
const rooms = db.prepare('SELECT id, room_number, status FROM rooms').all();
console.log('\nRooms:', JSON.stringify(rooms, null, 2));

// Check verifications
const verifications = db.prepare('SELECT * FROM verifications').all();
console.log('\nVerifications:', JSON.stringify(verifications, null, 2));
