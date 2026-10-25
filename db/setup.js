/* สคริปต์ npm run db:setup: สร้างตารางและข้อมูลตัวอย่างสำหรับฐานข้อมูลใหม่ */
const fs = require('node:fs');
const path = require('node:path');
const pool = require('./pool');
const seed = require('./seed');
(async () => {
  const client = await pool.connect();
  try {

    /* ตรวจตาราง users ก่อน; ถ้ามีแล้วจะไม่รัน schema หรือ seed ทับ */
    const existing = await client.query("SELECT to_regclass('public.users') AS name");
    if (existing.rows[0].name) {
      console.log('Database already contains users. No data changed.');
      return;
    }

    /* ใช้ Transaction ครอบ schema และ seed; ตัด BEGIN/COMMIT ของไฟล์ SQL ออกเพื่อไม่ซ้อนกัน */
    await client.query('BEGIN');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8').replace(
      /^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, '');
    await client.query(schema);
    await seed(client);
    await client.query('COMMIT');
    console.log('anysio schema and sample accounts created. See README for demo credentials.');

    /* ย้อนกลับเมื่อสร้างไม่สำเร็จ แล้วคืน Connection และปิด Pool ใน finally */
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Setup failed:', e.code || e.name);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => {
  console.error('Database connection failed:', e.code || e.name);
  process.exitCode = 1;
  pool.end();
});
