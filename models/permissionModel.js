/* Model permission: รวม SQL แบบมีพารามิเตอร์ ไม่รับ req/res และไม่แสดงหน้าเว็บ */

/* อ่านรหัสสิทธิ์สำหรับตรวจการมอบสิทธิ์ (สิทธิ์) */
function findCodeById(db, permissionId) {
  return db.query('SELECT code FROM permissions WHERE id=$1', [permissionId]);
}

/* อ่านรายการทั้งหมด (สิทธิ์) */
function list(db) {
  return db.query('SELECT * FROM permissions ORDER BY code');
}

/* ลบข้อมูลตามรหัส โดยคงข้อจำกัด Foreign Key ของฐานข้อมูล (สิทธิ์) */
function remove(db, permissionId) {
  return db.query('DELETE FROM permissions WHERE id=$1 RETURNING id', [permissionId]);
}

/* แก้ไขข้อมูลตามรหัส (สิทธิ์) */
function update(db, name, description, permissionId) {
  return db.query('UPDATE permissions SET name=$1,description=$2 WHERE id=$3 RETURNING id', [
    name,
    description,
    permissionId
  ]);
}

/* เพิ่มข้อมูลใหม่ (สิทธิ์) */
function create(db, code, name, description) {
  return db.query('INSERT INTO permissions(code,name,description) VALUES($1,$2,$3) RETURNING id', [
    code,
    name,
    description
  ]);
}

module.exports = { findCodeById, list, remove, update, create };
