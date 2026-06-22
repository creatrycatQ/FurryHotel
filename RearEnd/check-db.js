const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'furry_hotel.db'));

console.log('\n=== room_types 表数据 ===');
const roomTypes = db.prepare('SELECT * FROM room_types LIMIT 10').all();
console.table(roomTypes);


db.close();
