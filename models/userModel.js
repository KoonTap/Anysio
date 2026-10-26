/* Model user: รวม SQL แบบมีพารามิเตอร์ ไม่รับ req/res และไม่แสดงหน้าเว็บ */

/* ตรวจว่าบัญชียังเปิดใช้งานและมีสิทธิ์บันทึกผลตรวจ (บัญชีผู้ใช้) */
function findEligibleVet(db, userId) {
  return db.query(
    "SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND u.is_active AND NOT r.is_admin AND EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=r.id AND p.code='visit.create')",
    [userId]
  );
}

/* อ่านรายชื่อผู้ตรวจที่เปิดใช้งาน มี visit.create และไม่ใช่ Admin (บัญชีผู้ใช้) */
function listEligibleVets(db) {
  return db.query(
    "SELECT DISTINCT u.id,u.full_name FROM users u JOIN roles r ON r.id=u.role_id JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE u.is_active AND NOT r.is_admin AND p.code='visit.create' ORDER BY u.full_name"
  );
}

/* อ่านรหัสและชื่อบัญชีสำหรับตัวกรอง (บัญชีผู้ใช้) */
function listNames(db) {
  return db.query('SELECT id,username FROM users ORDER BY username');
}

/* ลบข้อมูลตามรหัส โดยคงข้อจำกัด Foreign Key ของฐานข้อมูล (บัญชีผู้ใช้) */
function remove(db, userId) {
  return db.query('DELETE FROM users WHERE id=$1', [userId]);
}

/* ตรวจข้อมูลสัตว์ นัด ผลตรวจ หรือไฟล์ที่อ้างถึงบัญชีก่อนลบ (บัญชีผู้ใช้) */
function hasClinicalData(db, userId) {
  return db.query(
    `SELECT
        EXISTS(SELECT 1 FROM pets WHERE owner_id=$1) OR
        EXISTS(SELECT 1 FROM appointments WHERE vet_id=$1) OR
        EXISTS(SELECT 1 FROM visit_records WHERE vet_id=$1) OR
        EXISTS(SELECT 1 FROM files WHERE uploaded_by=$1) AS found`,
    [userId]
  );
}

/* นับ Admin ที่เปิดใช้งานเพื่อป้องกันการลบคนสุดท้าย (บัญชีผู้ใช้) */
function countActiveAdmins(db) {
  return db.query(
    'SELECT count(*) AS n FROM users u JOIN roles r ON r.id=u.role_id WHERE r.is_admin AND u.is_active'
  );
}

/* อ่านและล็อกแถวจนจบ Transaction เพื่อป้องกันการแก้พร้อมกัน (บัญชีผู้ใช้) */
function findForUpdate(db, userId) {
  return db.query(
    'SELECT u.*,r.is_admin FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 FOR UPDATE OF u',
    [userId]
  );
}

/* แก้ไขข้อมูลตามรหัส (บัญชีผู้ใช้) */
function update(db, fullName, roleId, isActive, userId) {
  return db.query('UPDATE users SET full_name=$1,role_id=$2,is_active=$3 WHERE id=$4', [
    fullName,
    roleId,
    isActive,
    userId
  ]);
}

/* อ่านรายการทั้งหมด (บัญชีผู้ใช้) */
function list(db) {
  return db.query(
    'SELECT u.id,u.username,u.full_name,u.role_id,u.is_active,r.name AS role_name FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.id'
  );
}

/* ค้นบัญชีพร้อม Hash สำหรับตรวจรหัสผ่าน; ห้ามส่งผลนี้ให้ View (บัญชีผู้ใช้) */
function findByUsername(db, username) {
  return db.query('SELECT * FROM users WHERE username=$1', [username]);
}

/* เพิ่มข้อมูลใหม่ (บัญชีผู้ใช้) */
function create(db, username, passwordHash, fullName, roleId) {
  return db.query(
    'INSERT INTO users(username, password_hash, full_name, role_id) VALUES($1, $2, $3, $4) RETURNING id',
    [username, passwordHash, fullName, roleId]
  );
}

/* อ่านบัญชีและบทบาทจาก Session โดยไม่ส่ง Hash ออกมา (บัญชีผู้ใช้) */
function findSessionUser(db, userId) {
  return db.query(
    'SELECT u.id,u.username,u.full_name,u.role_id,u.is_active,r.name AS role_name,r.is_admin FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1',
    [userId]
  );
}

module.exports = {
  findEligibleVet,
  listEligibleVets,
  listNames,
  remove,
  hasClinicalData,
  countActiveAdmins,
  findForUpdate,
  update,
  list,
  findByUsername,
  create,
  findSessionUser
};
