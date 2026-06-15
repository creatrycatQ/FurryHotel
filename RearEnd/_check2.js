const Database = require('better-sqlite3');
const db = new Database('./furry_hotel.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));
try {
  const rows = db.prepare('SELECT * FROM room_types').all();
  console.log('room_types rows:', JSON.stringify(rows, null, 2));
} catch (e) {
  console.log('Error querying room_types:', e.message);
}
db.close();
