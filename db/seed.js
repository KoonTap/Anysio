/* สร้างข้อมูลเริ่มต้นสำหรับฐานใหม่: บทบาท สิทธิ์ บัญชีตัวอย่าง สัตว์ และนัด */
const bcrypt = require('bcryptjs');
const {
  catalog,
  grants
} = require('./catalog');
async function seed(db) {

  /* กำหนด 4 บทบาท โดย Admin ใช้ is_admin เป็นตัวบอกสิทธิ์สูงสุด */
  const rs = [
    ['admin', 'ผู้ดูแลระบบ', true],
    ['owner', 'เจ้าของสัตว์', false],
    ['receptionist', 'เจ้าหน้าที่ต้อนรับ', false],
    ['vet', 'สัตวแพทย์', false]
  ];
  const roleIds = {};
  for (const [code, name, admin] of rs) roleIds[code] = (await db.query(
    'INSERT INTO roles(code,name,is_admin) VALUES($1,$2,$3) RETURNING id', [code, name, admin]
  )).rows[0].id;

  /* สร้างรายการ Permission และผูกกับแต่ละ Role ตาม grants ใน catalog.js */
  for (const [code, name] of Object.entries(catalog)) {
    const p = (await db.query('INSERT INTO permissions(code,name) VALUES($1,$2) RETURNING id', [
      code, name
    ])).rows[0];
    for (const [role, codes] of Object.entries(grants))
      if (codes.includes(code)) await db.query('INSERT INTO role_permissions VALUES($1,$2)', [
        roleIds[role], p.id
      ]);
  }

  /* รหัสนี้ใช้เฉพาะสร้างบัญชีตัวอย่าง; ฐานข้อมูลเก็บ Hash ไม่เก็บรหัสผ่านตรง ๆ */
  const hash = await bcrypt.hash('Anysio123!', 12);
  const ids = {};
  for (const [username, fullName, role] of [
      ['admin', 'ผู้ดูแล anysio', 'admin'],
      ['owner', 'คุณมิน เจ้าของสัตว์', 'owner'],
      ['owner2', 'คุณต้น เจ้าของสัตว์', 'owner'],
      ['reception', 'คุณฟ้า เจ้าหน้าที่', 'receptionist'],
      ['vet', 'สพ.ญ. พิมพ์ใจ', 'vet'],
      ['vet2', 'น.สพ. ภูมิ', 'vet']
    ]) ids[username] = (await db.query(
    'INSERT INTO users(username,password_hash,full_name,role_id) VALUES($1,$2,$3,$4) RETURNING id',
    [username, hash, fullName, roleIds[role]])).rows[0].id;

  /* เพิ่มสัตว์ตัวอย่างให้ Owner แต่ละคน แล้วสร้างนัดวันถัดไปเวลา 10:00 ตามเวลาไทย */
  await db.query(
    "INSERT INTO pets(owner_id,name,species,breed,note) VALUES($1,'โมจิ','cat','British Shorthair','ขี้อายเล็กน้อย'),($1,'โกโก้','dog','Golden Retriever',''),($2,'ส้มส้ม','cat','แมวไทย','')",
    [ids.owner, ids.owner2]);
  await db.query(
    "INSERT INTO appointments(pet_id,scheduled_at,reason) SELECT id, (CURRENT_DATE + 1 + TIME '10:00') AT TIME ZONE 'Asia/Bangkok','ตรวจสุขภาพประจำปี' FROM pets WHERE name='โมจิ'"
  );
}
module.exports = seed;
