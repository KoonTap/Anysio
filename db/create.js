/* สคริปต์สร้างฐานข้อมูลเปล่าตามชื่อที่ตั้งไว้; ยังไม่สร้างตารางหรือบัญชีตัวอย่าง */
require('dotenv').config({
  quiet: true
});
const {
  Pool
} = require('pg');
const configured = require('./pool');

/* อ่านชื่อฐานข้อมูลและตรวจรูปแบบ เพราะชื่อฐานข้อมูลนำไปประกอบคำสั่ง CREATE DATABASE */
async function main() {
  const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1) :
    configured.options.database;
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(target)) throw new Error('Unsupported database name');

  /* เชื่อมฐาน postgres สำหรับตรวจและสร้างฐานเป้าหมายที่อาจยังไม่มี */
  const options = {
    ...configured.options,
    password: configured.options.password,
    database: 'postgres'
  };
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    u.pathname = '/postgres';
    options.connectionString = u.toString();
  }
  const admin = new Pool(options);
  try {

    /* ถ้ามีฐานข้อมูลแล้วให้หยุดโดยไม่ล้างข้อมูลเดิม */
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [target]);
    if (exists.rowCount) {
      console.log('Database exists:', target);
      return;
    }
    await admin.query('CREATE DATABASE "' + target + '"');
    console.log('Created database:', target);

    /* ปิด Connection Pool เมื่อทำงานจบ เพื่อไม่ให้สคริปต์ค้าง */
  } finally {
    await admin.end();
    await configured.end();
  }
}
main().catch(e => {
  console.error('Cannot create database:', e.code || e.name);
  process.exitCode = 1;
});
