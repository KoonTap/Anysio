/* อ่านค่าการเชื่อมต่อ PostgreSQL จาก .env โดยไม่แสดงข้อมูลลับในหน้าจอ */
require('dotenv').config({
  quiet: true
});
const {
  Pool,
  types
} = require('pg');
// DATE is a calendar date, not an instant; preserve it without timezone conversion.

/* เก็บชนิด DATE เป็นข้อความวันที่ ไม่แปลงเขตเวลาจนวันคลาดเคลื่อน */
types.setTypeParser(1082, value => value);

/* ใช้ DATABASE_URL หากมี มิฉะนั้นใช้ค่าที่แยกเป็น Host, Port, Database, User, Password */
const config = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL
} : {
  host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
  database: process.env.DB_NAME || process.env.DB_DATABASE || process.env.PGDATABASE || 'anysio',
  user: process.env.DB_USER || process.env.PGUSER || 'postgres',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD
};

/* สร้าง Connection Pool เพื่อใช้การเชื่อมต่อร่วมกัน และรอเชื่อมต่อไม่เกิน 5 วินาที */
module.exports = new Pool({
  ...config,
  connectionTimeoutMillis: 5000
});
