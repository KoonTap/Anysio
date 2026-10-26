/* Model role: รวม SQL แบบมีพารามิเตอร์ ไม่รับ req/res และไม่แสดงหน้าเว็บ */

/* ค้นข้อมูลตามรหัส (บทบาท) */
function findById(db, roleId) {
  return db.query('SELECT * FROM roles WHERE id=$1', [roleId]);
}

/* อ่านรายการทั้งหมด (บทบาท) */
function list(db) {
  return db.query('SELECT * FROM roles ORDER BY id');
}

/* ลบข้อมูลตามรหัส โดยคงข้อจำกัด Foreign Key ของฐานข้อมูล (บทบาท) */
function remove(db, roleId) {
  return db.query('DELETE FROM roles WHERE id=$1', [roleId]);
}

/* อ่านและล็อกแถวจนจบ Transaction เพื่อป้องกันการแก้พร้อมกัน (บทบาท) */
function findForUpdate(db, roleId) {
  return db.query('SELECT * FROM roles WHERE id=$1 FOR UPDATE', [roleId]);
}

/* แก้ไขข้อมูลตามรหัส (บทบาท) */
function update(db, name, description, roleId) {
  return db.query('UPDATE roles SET name=$1,description=$2 WHERE id=$3 RETURNING id', [
    name,
    description,
    roleId
  ]);
}

/* เพิ่มข้อมูลใหม่ (บทบาท) */
function create(db, code, name, description) {
  return db.query('INSERT INTO roles(code,name,description) VALUES($1,$2,$3) RETURNING id', [
    code,
    name,
    description
  ]);
}

/* อ่านบทบาทพร้อมจำนวนบัญชีที่ใช้อยู่ (บทบาท) */
function listWithUserCount(db) {
  return db.query(
    'SELECT r.*, (SELECT count(*) FROM users u WHERE u.role_id=r.id) AS user_count FROM roles r ORDER BY id'
  );
}

/* ล็อกบทบาท Admin เพื่อเรียงลำดับงานที่อาจทำให้ไม่มี Admin เหลือ (บทบาท) */
function lockAdmin(db) {
  return db.query('SELECT id FROM roles WHERE is_admin=TRUE FOR UPDATE');
}

/* อ่านและล็อกบทบาท Owner สำหรับสมัครสมาชิกสาธารณะ (บทบาท) */
function findOwnerForRegistration(db) {
  return db.query("SELECT id FROM roles WHERE code = 'owner' AND is_admin = FALSE FOR SHARE");
}

module.exports = {
  findById,
  list,
  remove,
  findForUpdate,
  update,
  create,
  listWithUserCount,
  lockAdmin,
  findOwnerForRegistration
};
