const bcrypt = require('bcryptjs');
require('./database.js'); // Ensure tables are created
const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = process.env.DB_PATH ? path.resolve(__dirname, process.env.DB_PATH) : path.join(__dirname, 'furry_hotel.db');
const db = new Database(DB_PATH);

const users = [
  { username: 'user01', nickname: '白狼Rex', real_name: '张伟', phone: '13812345671', id_card: '110105199001011234' },
  { username: 'user02', nickname: '赤狐Tails', real_name: '王芳', phone: '13912345672', id_card: '310104199202022345' },
  { username: 'user03', nickname: '雪豹Leo', real_name: '李娜', phone: '13712345673', id_card: '440106199503033456' },
  { username: 'user04', nickname: '黑猫Shadow', real_name: '刘洋', phone: '13612345674', id_card: '510107199804044567' },
  { username: 'user05', nickname: '金毛Max', real_name: '陈静', phone: '13512345675', id_card: '330108199105055678' },
  { username: 'user06', nickname: '哈士奇Doge', real_name: '杨帆', phone: '15012345676', id_card: '420102199606066789' },
  { username: 'user07', nickname: '柴犬Kuro', real_name: '赵强', phone: '15112345677', id_card: '610103199307077890' },
  { username: 'user08', nickname: '布偶猫Luna', real_name: '黄洁', phone: '15212345678', id_card: '320104199908088901' },
  { username: 'user09', nickname: '灰狼Fang', real_name: '周建国', phone: '15812345679', id_card: '120105198809099012' },
  { username: 'user10', nickname: '水獭Otty', real_name: '吴燕', phone: '15912345670', id_card: '500106199710100123' },
];

console.log('开始生成虚拟的实名用户...');

const insert = db.prepare(`
  INSERT INTO users (username, password, nickname, phone, real_name, id_card, role, status)
  VALUES (@username, @password, @nickname, @phone, @real_name, @id_card, 'guest', 'active')
`);

const defaultPassword = 'password123';
const hash = bcrypt.hashSync(defaultPassword, 10);

let count = 0;
for (const u of users) {
  try {
    insert.run({
      username: u.username,
      password: hash,
      nickname: u.nickname,
      phone: u.phone,
      real_name: u.real_name,
      id_card: u.id_card,
    });
    count++;
    console.log(`[成功] 添加用户: ${u.username} (实名: ${u.real_name})`);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      console.log(`[跳过] 用户已存在: ${u.username}`);
    } else {
      console.error(`[错误] 添加用户 ${u.username} 失败:`, err.message);
    }
  }
}

console.log(`\\n生成完毕！共成功添加 ${count} 个用户。`);
console.log(`所有生成的用户的默认密码均为: ${defaultPassword}`);
