const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'furry_hotel.db'));

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

try { console.log('Users count:', db.prepare('SELECT count(*) as cnt FROM users').get().cnt); } catch(e) { console.log('Users table error:', e.message); }
try { console.log('Rooms count:', db.prepare('SELECT count(*) as cnt FROM rooms').get().cnt); } catch(e) { console.log('Rooms table error:', e.message); }
try { console.log('Orders count:', db.prepare('SELECT count(*) as cnt FROM orders').get().cnt); } catch(e) { console.log('Orders table error:', e.message); }
try { console.log('Guests count:', db.prepare('SELECT count(*) as cnt FROM guests').get().cnt); } catch(e) { console.log('Guests table error:', e.message); }
try { console.log('Room_types count:', db.prepare('SELECT count(*) as cnt FROM room_types').get().cnt); } catch(e) { console.log('Room_types table error:', e.message); }

// Show some sample data
try {
  const rooms = db.prepare('SELECT * FROM rooms LIMIT 5').all();
  console.log('\nSample rooms:', JSON.stringify(rooms, null, 2));
} catch(e) { console.log('Rooms query error:', e.message); }

try {
  const users = db.prepare('SELECT id, username, nickname, role FROM users LIMIT 5').all();
  console.log('\nSample users:', JSON.stringify(users, null, 2));
} catch(e) { console.log('Users query error:', e.message); }

db.close();
